import type { Metadata } from "next";
import Display from "@/components/Display";
import { getEvents } from "@/lib/caldav";
import { serverNow, view } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Display · Calendar" };

export default async function Page() {
  const v = view();
  const initial = await getEvents(v.days);
  return <Display initial={initial} view={v} serverNow={serverNow()} />;
}
