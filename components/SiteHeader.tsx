import Link from "next/link";
import { CalendarDays } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// nav: in-page links; right: extra controls before the theme toggle
export default function SiteHeader({ nav, right }: { nav?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-fd-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-6 px-4 md:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5 font-semibold">
          <span className="icon-box inline-flex size-7 items-center justify-center rounded-lg border">
            <CalendarDays className="size-4" />
          </span>
          Calendar
        </Link>
        {nav && <div className="hidden items-center gap-5 text-sm text-fd-muted-foreground sm:flex">{nav}</div>}
        <div className="ml-auto flex items-center gap-2">
          {right}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
