import { getEvents } from "@/lib/caldav";
import { view } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await getEvents(view().days);
  return Response.json(feed, { headers: { "Cache-Control": "no-store" } });
}
