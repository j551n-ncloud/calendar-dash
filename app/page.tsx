import Dashboard from "@/components/Dashboard";
import SiteFooter from "@/components/SiteFooter";
import { getEvents } from "@/lib/caldav";
import { serverNow, view } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Page() {
  const v = view();
  const initial = await getEvents(v.days);
  return (
    <Dashboard initial={initial} view={v} serverNow={serverNow()}>
      <SiteFooter />
    </Dashboard>
  );
}
