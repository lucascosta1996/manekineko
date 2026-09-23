import seasons from "../../../seasons.json";
import { LandingExperience } from "./landing-experience";
import { plannedRewards } from "../lib/planned-rewards";

function getCollectionUrl() {
  const configured = process.env.NEXT_PUBLIC_WEB_URL;
  if (!configured)
    return process.env.NODE_ENV === "development"
      ? "http://localhost:3100"
      : null;
  try {
    const url = new URL(configured);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function LandingPage() {
  return (
    <LandingExperience
      appUrl={getCollectionUrl()}
      plannedRewards={plannedRewards}
      seasons={seasons.map(({ season, collections }) => ({
        season,
        colors: collections,
      }))}
    />
  );
}
