// Shared between server and browser: the event shape and the time maths for status and agenda.

export type CalEvent = {
  id: string;
  title: string;
  // timed events: ISO instants; all-day events: YYYY-MM-DD, end exclusive
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  calendar: string;
  color: string;
  // TRANSP:TRANSPARENT, shown but does not make the room busy
  free: boolean;
};

export type Feed = {
  events: CalEvent[];
  fetchedAt: string;
  // set when the last CalDAV fetch failed and events are from the cache
  error?: string;
};

export type View = {
  room: string;
  timeZone: string;
  locale: string;
  days: number;
  refreshMs: number;
  hideTitles: boolean;
  soonMinutes: number;
};

export const MIN = 60_000;

// YYYY-MM-DD of an instant in the display time zone
export function dayKey(t: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

export function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const startMs = (e: CalEvent) => (e.allDay ? NaN : Date.parse(e.start));
export const endMs = (e: CalEvent) => (e.allDay ? NaN : Date.parse(e.end));

export type Status =
  | { kind: "busy"; current: CalEvent; next?: CalEvent; until: number }
  | { kind: "soon"; next: CalEvent; until: number }
  | { kind: "free"; next?: CalEvent; until?: number };

// Busy while a timed, non-free event runs, "soon" in the minutes before the next one,
// free otherwise. Back-to-back meetings extend the busy time.
export function statusAt(events: CalEvent[], now: number, soonMinutes: number): Status {
  const timed = events.filter((e) => !e.allDay).sort((a, b) => startMs(a) - startMs(b));
  const blocking = timed.filter((e) => !e.free);
  const current = blocking.filter((e) => startMs(e) <= now && endMs(e) > now).sort((a, b) => endMs(a) - endMs(b))[0];
  const next = timed.find((e) => startMs(e) > now);

  if (current) {
    let until = Math.max(...blocking.filter((e) => startMs(e) <= now && endMs(e) > now).map(endMs));
    for (const e of blocking) if (startMs(e) <= until && endMs(e) > until) until = endMs(e);
    return { kind: "busy", current, next, until };
  }
  const nextBlocking = blocking.find((e) => startMs(e) > now);
  if (nextBlocking && startMs(nextBlocking) - now <= soonMinutes * MIN) {
    return { kind: "soon", next: nextBlocking, until: startMs(nextBlocking) };
  }
  return { kind: "free", next, until: nextBlocking ? startMs(nextBlocking) : undefined };
}

// "in 5 min", "in 2 h 10 min", "in 3 days"
export function relative(ms: number) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) {
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  return `${Math.round(m / 1440)} days`;
}
