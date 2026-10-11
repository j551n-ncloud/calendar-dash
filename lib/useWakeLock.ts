"use client";

import { useEffect } from "react";

// Keeps a tablet screen on while the page is visible. The lock is dropped by the
// browser whenever the tab is hidden, so it is taken again on every return.
export function useWakeLock(on = true) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    const take = () => {
      if (document.hidden) return;
      navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
