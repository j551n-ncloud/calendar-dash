import { NextResponse, type NextRequest } from "next/server";

// Optional password (DASH_PASSWORD), checked with HTTP basic auth so a kiosk tablet only asks once.
// The healthcheck stays public.
const PUBLIC = /^\/api\/health/;

function authorized(req: NextRequest) {
  const password = process.env.DASH_PASSWORD;
  if (!password || PUBLIC.test(req.nextUrl.pathname)) return true;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const [user, ...rest] = atob(header.slice(6)).split(":");
  return rest.join(":") === password && (!process.env.DASH_USER || user === process.env.DASH_USER);
}

// Access log to stdout (docker logs) for requests that come through Cloudflare, which puts the
// client IP in CF-Connecting-IP. Without it (local use, other proxies) nothing is logged.
export function proxy(req: NextRequest) {
  if (!authorized(req)) {
    return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Calendar"' } });
  }
  const ip = req.headers.get("cf-connecting-ip");
  if (!ip || req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const country = req.headers.get("cf-ipcountry") ?? "-";
  const ua = req.headers.get("user-agent") ?? "-";
  console.log(`${new Date().toISOString()} ${ip} ${country} ${req.method} ${req.nextUrl.pathname} "${ua}"`);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon|icon).*)"],
};
