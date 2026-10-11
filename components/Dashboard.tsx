"use client";

import Link from "next/link";
import { ArrowDown, Clock, MapPin, MonitorSmartphone, RefreshCw } from "lucide-react";
import DitherField from "@/components/DitherField";
import SiteHeader from "@/components/SiteHeader";
import { dayKey, endMs, relative, startMs, statusAt, type CalEvent, type Feed, type Status, type View } from "@/lib/calendar";
import { agenda, formatter } from "@/lib/format";
import { useFeed } from "@/lib/useFeed";
import { useNow } from "@/lib/useNow";

export default function Dashboard({ initial, view, serverNow, children }: {
  initial: Feed; view: View; serverNow: number; children?: React.ReactNode;
}) {
  const now = useNow(serverNow);
  const { feed, conn, refresh } = useFeed(initial, view.refreshMs);
  const f = formatter(view);
  const today = dayKey(now, view.timeZone);
  const status = statusAt(feed.events, now, view.soonMinutes);
  const days = agenda(feed.events, now, view);
  const nextId = status.kind === "busy" ? status.current.id : status.next?.id;
  const updated = f.time(Date.parse(feed.fetchedAt));
  const connLabel = conn === "loading" ? "Updating" : conn === "offline" ? `Offline · ${updated}` : `Updated ${updated}`;

  return (
    <>
      <SiteHeader
        nav={<>
          <a href="#now" className="transition-colors hover:text-fd-foreground">Now</a>
          <a href="#agenda" className="transition-colors hover:text-fd-foreground">Agenda</a>
          <Link href="/display" className="transition-colors hover:text-fd-foreground">Display</Link>
        </>}
        right={
          <button
            onClick={refresh}
            title={feed.error ?? "Load the calendar again"}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-fd-accent"
          >
            {conn === "loading" ? <RefreshCw className="spin size-3" /> : <span className={`live-dot ${conn}`} />}
            {connLabel}
          </button>
        }
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-4 pb-12 md:px-6">
        {/* HERO */}
        <section id="now" className={`hero status-${status.kind} relative scroll-mt-20 overflow-hidden rounded-2xl border`}>
          <DitherField />
          <div className="relative z-1 grid min-h-[380px] gap-8 p-6 md:min-h-[440px] md:p-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div className="flex flex-col justify-end">
              <div className="rise">
                <span className="state-pill mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
                  <span className={`live-dot ${status.kind}`} />
                  {headline(status, f, today).pill}
                </span>
              </div>
              <div className="rise" style={{ animationDelay: "120ms" }}>
                <p className="tabular mb-2 text-6xl font-medium tracking-tight text-white md:text-8xl" suppressHydrationWarning>
                  {f.time(now)}
                </p>
                <h1 className="mb-6 text-xl font-medium text-white/75 md:text-2xl">{f.date(now)}</h1>
              </div>
              <div className="rise" style={{ animationDelay: "240ms" }}>
                <p className="mb-8 max-w-[560px] text-white/75 md:text-lg">{headline(status, f, today).line}</p>
                <div className="flex flex-wrap gap-3">
                  <a href="#agenda" className="btn-fill inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors">
                    Agenda <ArrowDown className="size-4" />
                  </a>
                  <Link href="/display" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10">
                    <MonitorSmartphone className="size-4" /> Tablet display
                  </Link>
                </div>
              </div>
            </div>
            <div className="rise" style={{ animationDelay: "360ms" }}>
              <Spotlight status={status} now={now} f={f} today={today} />
            </div>
          </div>
        </section>

        {feed.error && (
          <p className="mt-4 rounded-xl border border-fd-error/30 bg-fd-error/5 px-4 py-3 text-sm text-fd-error">
            Could not reach the calendar: {feed.error}. Showing what was loaded at {updated}.
          </p>
        )}

        {/* AGENDA */}
        <Heading id="agenda">Agenda</Heading>
        <div className="mx-auto flex max-w-[960px] flex-col gap-8">
          {days.every((d) => !d.allDay.length && !d.timed.length) && (
            <p className="rounded-2xl border bg-fd-card p-8 text-center text-fd-muted-foreground">
              Nothing in the next {view.days} days.
            </p>
          )}
          {days.filter((d) => d.allDay.length || d.timed.length).map((d) => (
            <section key={d.key}>
              <h3 className="mb-3 flex items-baseline gap-3 font-medium">
                {f.day(d.key, today)}
                {d.timed.length > 0 && <span className="text-sm font-normal text-fd-muted-foreground">{d.timed.length} {d.timed.length === 1 ? "event" : "events"}</span>}
              </h3>
              {d.allDay.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {d.allDay.map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-2 rounded-full border bg-fd-card px-3 py-1 text-sm">
                      <span className="size-2 rounded-full" style={{ background: e.color }} />
                      {f.title(e)}
                    </span>
                  ))}
                </div>
              )}
              {d.timed.length > 0 && <ul className="overflow-hidden rounded-2xl border bg-fd-card">
                {d.timed.map((e) => (
                  <Row key={e.id} e={e} f={f} now={now} next={e.id === nextId} />
                ))}
              </ul>}
            </section>
          ))}
        </div>

        {children}
      </main>
    </>
  );
}

export type F = ReturnType<typeof formatter>;

function headline(s: Status, f: F, today: string) {
  if (s.kind === "busy") return { pill: `Busy until ${f.time(s.until)}`, line: `In ${f.title(s.current)} until ${f.time(s.until)}.` };
  if (s.kind === "soon") return { pill: `Starting soon`, line: `${f.title(s.next)} starts at ${f.time(s.until)}.` };
  if (s.until && f.isDay(s.until, today)) return { pill: `Free until ${f.time(s.until)}`, line: `Nothing on until ${f.time(s.until)}.` };
  return { pill: "Free", line: s.next ? `Nothing else today. Next up ${f.when(startMs(s.next), today)}.` : "Nothing coming up." };
}

// the dark card in the hero: what is on now, or what is next
// the dark card in the hero: what is on now, or what is next
export function Spotlight({ status, now, f, today }: { status: Status; now: number; f: F; today: string }) {
  const e = status.kind === "busy" ? status.current : status.next;
  const card = "rounded-2xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur-md";
  if (!e) return <div className={`${card} text-white/75`}>No upcoming events.</div>;

  const running = status.kind === "busy";
  const pct = running ? Math.min(100, ((now - startMs(e)) / (endMs(e) - startMs(e))) * 100) : 0;
  const after = running ? status.next : undefined;
  const left = relative((running ? endMs(e) : startMs(e)) - now);

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-3">
        <p className="state-text text-xs font-medium tracking-wider uppercase">
          {running ? "Now" : `Next · in ${left}`}
        </p>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-white/60">
          <span className="size-2 rounded-full" style={{ background: e.color }} />
          {e.calendar}
        </span>
      </div>
      <p className="mb-2 text-2xl leading-snug font-medium">{f.title(e)}</p>
      <p className="flex items-center gap-1.5 text-sm text-white/70">
        <Clock className="size-3.5" />
        {startMs(e) - now > 20 * 3600_000 ? `${f.when(startMs(e), today)} – ${f.time(endMs(e))}` : f.range(e)}
      </p>
      {e.location && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-white/70"><MapPin className="size-3.5" />{e.location}</p>
      )}
      {running && (
        <>
          <div className="progress mt-5"><span style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-xs text-white/60">Ends in {left}</p>
        </>
      )}
      {after && (
        <p className="mt-5 border-t border-white/10 pt-4 text-sm text-white/70">
          Then <span className="text-white">{f.title(after)}</span> at {f.when(startMs(after), today)}
        </p>
      )}
    </div>
  );
}

function Row({ e, f, now, next }: { e: CalEvent; f: F; now: number; next: boolean }) {
  const running = startMs(e) <= now;
  return (
    <li className={`flex gap-4 border-b px-4 py-3.5 last:border-b-0 md:px-5 ${next ? "next-ring" : ""}`}>
      <span className="tabular w-[104px] shrink-0 pt-0.5 text-sm text-fd-muted-foreground">{f.range(e)}</span>
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: e.color }} title={e.calendar} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${e.free ? "text-fd-muted-foreground" : ""}`}>{f.title(e)}</span>
        {e.location && <span className="block truncate text-sm text-fd-muted-foreground">{e.location}</span>}
      </span>
      {next && (
        <span className="accent-text hidden shrink-0 self-center text-xs font-medium sm:inline">
          {running ? "Now" : `in ${relative(startMs(e) - now)}`}
        </span>
      )}
    </li>
  );
}

export function Heading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="accent-text mt-20 mb-8 scroll-mt-20 text-center text-3xl font-medium tracking-tight md:text-4xl">
      {children}
    </h2>
  );
}
