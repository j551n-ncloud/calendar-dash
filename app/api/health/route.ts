// for the compose healthcheck, does not touch CalDAV
export function GET() {
  return new Response("ok");
}
