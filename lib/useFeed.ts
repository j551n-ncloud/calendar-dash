"use client";

import { useCallback, useEffect, useState } from "react";
import type { Feed } from "@/lib/calendar";

export type Conn = "online" | "offline" | "loading";

// Polls /api/events every refreshMs and when the tab becomes visible again.
export function useFeed(initial: Feed, refreshMs: number) {
  const [feed, setFeed] = useState(initial);
  const [conn, setConn] = useState<Conn>(initial.error ? "offline" : "online");

  const refresh = useCallback(async () => {
    setConn("loading");
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as Feed;
      setFeed(next);
      setConn(next.error ? "offline" : "online");
    } catch (e) {
      setFeed((f) => ({ ...f, error: e instanceof Error ? e.message : String(e) }));
      setConn("offline");
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, refreshMs);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, refreshMs]);

  return { feed, conn, refresh };
}
