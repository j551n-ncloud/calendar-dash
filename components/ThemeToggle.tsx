"use client";

import { Moon, Sun } from "lucide-react";

// The class is set before paint by the inline script in app/layout.tsx; this only flips it
export default function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="inline-flex items-center gap-0.5 rounded-full border p-1 text-fd-muted-foreground"
    >
      <Sun className="size-6 rounded-full p-1.5 bg-fd-accent text-fd-foreground dark:bg-transparent dark:text-fd-muted-foreground" />
      <Moon className="size-6 rounded-full p-1.5 dark:bg-fd-accent dark:text-fd-foreground" />
    </button>
  );
}
