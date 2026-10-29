import LandingPage from "../../../../../../apps/landing-page/app/page";
import WhitepaperPage from "../../../../../../apps/landing-page/app/whitepaper/page";
import RewardsPage from "../../../../../../apps/landing-page/app/rewards/page";
import { UISpecimens } from "@manekineko/ui/specimens";
import { LandingBoundary } from "../boundaries";
export default async function Page({ params }: { params: Promise<{ route?: string[] }> }) {
 const { route = [] } = await params;
 if (route[0] === "visual") return <LandingBoundary kind={route[1]} />;
 if (route[0] === "whitepaper") return <WhitepaperPage />;
 if (route[0] === "rewards") return <RewardsPage />;
 return route[0] === "specimens" ? <UISpecimens tabEntryFixture={route[1] === "tabs"} notificationFixture={route[1] === "notifications"} /> : <LandingPage />;
}
