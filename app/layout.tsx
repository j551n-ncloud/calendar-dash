import type { Metadata, Viewport } from "next";
import "./globals.css";
import { inter } from "@/lib/site";

export const metadata: Metadata = {
  title: "Calendar",
  description: "A calendar dashboard for any CalDAV server, with the next event up front.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Calendar" },
};

export const viewport: Viewport = {
  themeColor: "#0b1013",
  viewportFit: "cover",
};

// runs before paint so the page does not flash light in dark mode
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">{children}</body>
    </html>
  );
}
