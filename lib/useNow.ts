"use client";

import { useSyncExternalStore } from "react";

// One ticking clock for the whole page. The server render (and hydration) use the
// time the server rendered at, so the markup matches; the browser takes over after that.
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size) { clearInterval(timer); timer = undefined; }
  };
}

export function useNow(serverNow: number) {
  return useSyncExternalStore(subscribe, () => now, () => serverNow);
}
