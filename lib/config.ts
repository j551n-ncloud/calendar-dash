import "server-only";
import type { View } from "@/lib/calendar";

const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

export const caldav = {
  // one or more calendars, separated by commas or whitespace, each optionally named: Work=https://...
  sources: (process.env.CALDAV_URL ?? "").split(/[\s,]+/).filter(Boolean).map((entry) => {
    const m = entry.match(/^([^=:/]+)=(\w+:\/\/.+)$/);
    return m ? { name: m[1], url: m[2] } : { name: "", url: entry };
  }),
  user: process.env.CALDAV_USER ?? "",
  password: process.env.CALDAV_PASSWORD ?? "",
};

export function view(): View {
  return {
    room: process.env.ROOM_NAME ?? "",
    timeZone: process.env.TZ || "Europe/Berlin",
    locale: process.env.LOCALE || "en-GB",
    days: Math.min(num(process.env.DAYS, 7), 31),
    refreshMs: num(process.env.REFRESH_MINUTES, 5) * 60_000,
    hideTitles: /^(1|true|yes)$/i.test(process.env.HIDE_TITLES ?? ""),
    soonMinutes: num(process.env.SOON_MINUTES, 10),
  };
}

// the time the page was rendered at, handed to the client clock for hydration
export const serverNow = () => Date.now();
