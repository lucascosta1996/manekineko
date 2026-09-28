import LandingPage from "../../../../../../apps/landing-page/app/page";
import { UISpecimens } from "@manekineko/ui/specimens";
import { LandingBoundary } from "../boundaries";
export default async function Page({ params }: { params: Promise<{ route?: string[] }> }) {
 const { route = [] } = await params;
 if (route[0] === "visual") return <LandingBoundary kind={route[1]} />;
 return route[0] === "specimens" ? <UISpecimens tabEntryFixture={route[1] === "tabs"} /> : <LandingPage />;
}
