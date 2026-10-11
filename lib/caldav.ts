import "server-only";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { caldav } from "@/lib/config";
import type { CalEvent, Feed } from "@/lib/calendar";

// Reads events from CalDAV collections (REPORT calendar-query) or plain ICS feeds (GET),
// expands recurring events with ical.js, and caches the result in memory.

const PALETTE = ["#0047b3", "#0d9488", "#c2410c", "#7c3aed", "#be185d", "#4d7c0f"];
const TTL = 60_000;
const MAX_OCCURRENCES = 1000;

type Source = { url: string; name: string; color: string; events: CalEvent[] };

// The credentials only go to hosts of configured CalDAV collections, never to a feed elsewhere
// (a token URL, or the source a Nextcloud subscription points at).
const davHosts = () => new Set(caldav.sources.filter((s) => !isFeed(s.url)).map((s) => new URL(s.url).host));
const auth = (url: string) =>
  caldav.user && davHosts().has(new URL(url).host)
    ? { Authorization: `Basic ${Buffer.from(`${caldav.user}:${caldav.password}`).toString("base64")}` }
    : undefined;

// public shares (Nextcloud ?export) and .ics files are fetched as a whole, everything else is a CalDAV collection
const isFeed = (url: string) => /[?&]export\b|\.ics(\?|$)|^webcals?:/i.test(url);

const unescapeXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

// text of the first element with this local name, whatever namespace prefix the server uses
const xmlText = (xml: string, name: string) =>
  xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i"))?.[1];

const xmlAll = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "gi"))].map((m) => unescapeXml(m[1]));

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

async function dav(url: string, method: string, depth: string, body: string) {
  const res = await fetch(url, {
    method,
    headers: { ...auth(url), Depth: depth, "Content-Type": "application/xml; charset=utf-8" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 207) throw new Error(`${method} ${new URL(url).pathname}: HTTP ${res.status}`);
  return res.text();
}

async function readCollection(url: string, from: Date, to: Date) {
  const props = await dav(url, "PROPFIND", "0", `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:a="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop><d:displayname/><a:calendar-color/><d:resourcetype/><cs:source/></d:prop>
</d:propfind>`).catch(() => "");
  const name = unescapeXml(xmlText(props, "displayname") ?? "").trim();
  const color = (xmlText(props, "calendar-color") ?? "").trim().slice(0, 7);

  // A Nextcloud subscription (a mirrored ICS feed) is listed as a calendar but has no objects
  // over CalDAV, so read the feed it points at instead.
  const source = /<(?:[\w-]+:)?subscribed\b/i.test(xmlText(props, "resourcetype") ?? "") && xmlText(xmlText(props, "source") ?? "", "href");
  if (source) return { ...(await readFeed(unescapeXml(source).trim())), name, color };

  const report = await dav(url, "REPORT", "1", `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${utc(from)}" end="${utc(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`);
  return { name, color, ics: xmlAll(report, "calendar-data") };
}

async function readFeed(url: string) {
  const res = await fetch(url.replace(/^webcal/i, "https"), { headers: auth(url), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  // host and path only, the query may hold a token
  if (!res.ok) throw new Error(`GET ${res.url.split("?")[0]}: HTTP ${res.status}`);
  const ics = await res.text();
  const cal = new ICAL.Component(ICAL.parse(ics));
  return { name: String(cal.getFirstPropertyValue("x-wr-calname") ?? ""), color: "", ics: [ics] };
}

function toEvents(ics: string[], from: Date, to: Date, source: Omit<Source, "events">): CalEvent[] {
  const out: CalEvent[] = [];
  const rangeStart = ICAL.Time.fromJSDate(from, true);
  const rangeEnd = ICAL.Time.fromJSDate(to, true);
  // ids go to the browser, so they carry a hash of the source, not its URL (which may hold a token)
  const tag = createHash("sha256").update(source.url).digest("hex").slice(0, 8);

  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time, key: string) => {
    const comp = ev.component;
    if (String(comp.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    const allDay = start.isDate;
    out.push({
      id: `${tag}#${ev.uid}#${key}`,
      title: ev.summary || "Busy",
      start: allDay ? start.toString() : start.toJSDate().toISOString(),
      end: allDay ? (end.isDate && end.compare(start) > 0 ? end.toString() : addDay(start)) : end.toJSDate().toISOString(),
      allDay,
      location: ev.location || undefined,
      calendar: source.name,
      color: source.color,
      free: String(comp.getFirstPropertyValue("transp") ?? "").toUpperCase() === "TRANSPARENT",
    });
  };

  for (const text of ics) {
    let cal: ICAL.Component;
    try {
      cal = new ICAL.Component(ICAL.parse(text));
    } catch {
      continue;
    }
    for (const tz of cal.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

    const vevents = cal.getAllSubcomponents("vevent").map((c) => new ICAL.Event(c));
    const masters = new Map<string, ICAL.Event>();
    for (const ev of vevents) if (!ev.isRecurrenceException()) masters.set(ev.uid, ev);
    for (const ev of vevents) {
      if (!ev.isRecurrenceException()) continue;
      const master = masters.get(ev.uid);
      if (master) master.relateException(ev);
      else push(ev, ev.startDate, ev.endDate, ev.recurrenceId.toString());
    }

    for (const ev of masters.values()) {
      if (!ev.startDate) continue;
      if (!ev.isRecurring()) {
        if (ev.endDate.compare(rangeStart) > 0 && ev.startDate.compare(rangeEnd) < 0) push(ev, ev.startDate, ev.endDate, "0");
        continue;
      }
      const it = ev.iterator();
      for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
        if (next.compare(rangeEnd) >= 0) break;
        const d = ev.getOccurrenceDetails(next);
        if (d.endDate.compare(rangeStart) <= 0) continue;
        push(d.item, d.startDate, d.endDate, next.toString());
      }
    }
  }
  return out;
}

function addDay(t: ICAL.Time) {
  const n = t.clone();
  n.adjust(1, 0, 0, 0);
  return n.toString();
}

let cache: { at: number; key: string; feed: Feed } | undefined;
let inflight: Promise<Feed> | undefined;

export async function getEvents(days: number): Promise<Feed> {
  const key = `${days}`;
  if (cache && cache.key === key && Date.now() - cache.at < TTL) return cache.feed;
  inflight ??= load(days).finally(() => { inflight = undefined; });
  return inflight;
}

async function load(days: number): Promise<Feed> {
  if (!caldav.sources.length) return { events: [], fetchedAt: new Date().toISOString(), error: "CALDAV_URL is not set" };
  const from = new Date(Date.now() - 24 * 3600_000);
  const to = new Date(Date.now() + (days + 1) * 24 * 3600_000);

  const results = await Promise.allSettled(caldav.sources.map(async ({ url, name }, i) => {
    const raw = isFeed(url) ? await readFeed(url) : await readCollection(url, from, to);
    const source = { url, name: name || raw.name || `Calendar ${i + 1}`, color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : PALETTE[i % PALETTE.length] };
    return toEvents(raw.ics, from, to, source);
  }));

  const failed = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason);
  for (const e of failed) console.error("[caldav]", e instanceof Error ? e.message : e);

  // all sources failed: keep showing the last good data, flagged as stale
  if (failed.length === results.length) {
    const msg = failed[0] instanceof Error ? failed[0].message : String(failed[0]);
    if (cache) return { ...cache.feed, error: msg };
    return { events: [], fetchedAt: new Date().toISOString(), error: msg };
  }

  const events = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  const feed: Feed = {
    events,
    fetchedAt: new Date().toISOString(),
    error: failed.length ? `${failed.length} of ${results.length} calendars failed` : undefined,
  };
  cache = { at: Date.now(), key: `${days}`, feed };
  return feed;
}
