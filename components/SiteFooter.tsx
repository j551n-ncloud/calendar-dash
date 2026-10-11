import { GitBranch } from "lucide-react";

const version = (process.env.NEXT_PUBLIC_APP_VERSION ?? "dev").replace(/^v/, "");

export default function SiteFooter() {
  return (
    <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm text-fd-muted-foreground">
      <span>Calendar · v{version}</span>
      <a
        href="https://github.com/j551n-ncloud/calendar-dash"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 transition-colors hover:text-fd-foreground"
      >
        <GitBranch className="size-3.5" />
        GitHub
      </a>
    </footer>
  );
}
