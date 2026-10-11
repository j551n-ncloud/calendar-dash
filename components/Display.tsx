"use client";

import Link from "next/link";
import { ArrowLeft, Maximize } from "lucide-react";
import { Spotlight } from "@/components/Dashboard";
import DitherField from "@/components/DitherField";
import ThemeToggle from "@/components/ThemeToggle";
import { dayKey, relative, startMs, statusAt, type Feed, type View } from "@/lib/calendar";
import { agenda, formatter } from "@/lib/format";
import { useFeed } from "@/lib/useFeed";
import { useNow } from "@/lib/useNow";
import { useWakeLock } from "@/lib/useWakeLock";

const LABEL = { free: "Available", soon: "Starting soon", busy: "Busy" } as const;

// Full-screen room display for a tablet, after spacepad.io, built on the same hero as the
// home page: dither field, rise animations, the state colour glowing up from the corner.
export default function Display({ initial, view, serverNow }: { initial: Feed; view: View; serverNow: number }) {
  const now = useNow(serverNow);
  const { feed, conn } = useFeed(initial, view.refreshMs);
  useWakeLock();
  const f = formatter(view);
  const today = dayKey(now, view.timeZone);
  const s = statusAt(feed.events, now, view.soonMinutes);
  const day = agenda(feed.events, now, view)[0];
  const focus = s.kind === "busy" ? s.current : s.next;

  const sub =
    s.kind === "busy" ? `until ${f.time(s.until)} · ${relative(s.until - now)} left`
    : s.kind === "soon" ? `in ${relative(s.until - now)}, at ${f.time(s.until)}`
    : s.until && f.isDay(s.until, today) ? `until ${f.time(s.until)}`
    : "for the rest of the day";

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <main className="display-scale flex h-dvh flex-col">
      <section className={`hero status-${s.kind} relative flex flex-1 flex-col overflow-hidden`}>
        <DitherField />
        <div className="state-glow" />

        <header className="rise relative z-1 flex items-center gap-3 p-5 text-white md:px-10 md:pt-8">
          <Link href="/" aria-label="Back to the dashboard" className="rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <ArrowLeft className="size-5" />
          </Link>
          <span className="text-lg font-medium">{view.room || "Calendar"}</span>
          <span className={`live-dot ${conn === "offline" ? "offline" : "online"}`} title={feed.error ?? "Connected"} />
          <button onClick={fullscreen} aria-label="Full screen" className="ml-auto rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <Maximize className="size-5" />
          </button>
          <ThemeToggle />
        </header>

        <div className="relative z-1 grid flex-1 gap-8 overflow-y-auto px-5 pb-6 md:px-10 md:pb-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-16">
          <div className="flex flex-col justify-center">
            <div className="rise" style={{ animationDelay: "120ms" }}>
              <span className="state-pill mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium backdrop-blur">
                <span className={`live-dot ${s.kind}`} />
                {f.date(now)}
              </span>
            </div>
            <div className="rise" style={{ animationDelay: "240ms" }}>
              <p className="tabular text-7xl leading-none font-medium tracking-tight text-white md:text-[10rem]" suppressHydrationWarning>
                {f.time(now)}
              </p>
            </div>
            <div className="rise" style={{ animationDelay: "360ms" }}>
              <p className="state-text mt-6 text-4xl font-medium tracking-tight md:text-6xl">{LABEL[s.kind]}</p>
              <p className="tabular mt-2 text-xl text-white/75 md:text-3xl">{sub}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rise" style={{ animationDelay: "480ms" }}>
              <Spotlight status={s} now={now} f={f} today={today} />
            </div>
            <div className="rise rounded-2xl border border-white/10 bg-white/5 p-5 text-white backdrop-blur-md" style={{ animationDelay: "600ms" }}>
              <p className="mb-3 text-xs font-medium tracking-wider text-white/60 uppercase">Today</p>
              {day.allDay.map((e) => (
                <p key={e.id} className="mb-2 flex items-center gap-2 text-sm text-white/80">
                  <span className="size-2 rounded-full" style={{ background: e.color }} />
                  {f.title(e)}
                </p>
              ))}
              {day.timed.length === 0 ? (
                <p className="text-sm text-white/60">Nothing else today.</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {day.timed.slice(0, 8).map((e) => (
                    <li key={e.id} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${e.id === focus?.id ? "bg-white/10" : ""}`}>
                      <span className="tabular w-12 shrink-0 text-white/60">{f.time(startMs(e))}</span>
                      <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                      <span className="truncate">{f.title(e)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
