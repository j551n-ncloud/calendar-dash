import { addDays, dayKey, endMs, startMs, type CalEvent, type View } from "@/lib/calendar";

// Formatting in the configured time zone and locale, so the server render and the browser agree.
export function formatter(v: View) {
  const opts = { timeZone: v.timeZone };
  const time = new Intl.DateTimeFormat(v.locale, { ...opts, hour: "2-digit", minute: "2-digit" });
  const clock = new Intl.DateTimeFormat(v.locale, { ...opts, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const long = new Intl.DateTimeFormat(v.locale, { ...opts, weekday: "long", day: "numeric", month: "long" });
  const short = new Intl.DateTimeFormat(v.locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const weekday = new Intl.DateTimeFormat(v.locale, { timeZone: "UTC", weekday: "short" });

  return {
    time: (t: number) => time.format(t),
    clock: (t: number) => clock.format(t),
    date: (t: number) => long.format(t),
    // label for a YYYY-MM-DD day, relative to today
    day(key: string, today: string) {
      if (key === today) return "Today";
      if (key === addDays(today, 1)) return "Tomorrow";
      return short.format(new Date(`${key}T12:00:00Z`));
    },
    isDay: (t: number, key: string) => dayKey(t, v.timeZone) === key,
    // "14:00" today, "Tue 09:00" on another day
    when(t: number, today: string) {
      const k = dayKey(t, v.timeZone);
      return k === today ? time.format(t) : `${weekday.format(new Date(`${k}T12:00:00Z`))} ${time.format(t)}`;
    },
    range: (e: CalEvent) => `${time.format(startMs(e))} – ${time.format(endMs(e))}`,
    title: (e: CalEvent) => (v.hideTitles ? (e.free ? "Tentative" : "Busy") : e.title),
  };
}

export type Day = { key: string; allDay: CalEvent[]; timed: CalEvent[] };

// Days from today on, each with its all-day events and the timed events still to come.
// A running event shows under today, a multi-day all-day event under every day it covers.
export function agenda(events: CalEvent[], now: number, v: View): Day[] {
  const today = dayKey(now, v.timeZone);
  const days: Day[] = Array.from({ length: v.days }, (_, i) => ({ key: addDays(today, i), allDay: [], timed: [] }));
  const byKey = new Map(days.map((d) => [d.key, d]));

  for (const e of events) {
    if (e.allDay) {
      for (const d of days) if (e.start <= d.key && e.end > d.key) d.allDay.push(e);
      continue;
    }
    if (endMs(e) <= now) continue;
    byKey.get(dayKey(Math.max(startMs(e), now), v.timeZone))?.timed.push(e);
  }
  for (const d of days) d.timed.sort((a, b) => startMs(a) - startMs(b));
  return days;
}
