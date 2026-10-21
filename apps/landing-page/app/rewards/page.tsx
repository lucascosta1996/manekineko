import type { Metadata } from "next";
import { publicLinks } from "@manekineko/ui/links";
import seasons from "../../../../seasons.json";
import { LandingExperience } from "../landing-experience";
import { plannedRewards } from "../../lib/planned-rewards";

export const metadata: Metadata = { title: "Tincta Rewards — Rewards governed by smart contracts.", description: "Explore collection-based prizes, affiliate rewards, and refund conditions defined by smart contracts." };

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

export default function RewardsPage() {
  const footerLinks = publicLinks({ website: process.env.NEXT_PUBLIC_LANDING_URL ?? process.env.NEWSLETTER_PUBLIC_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://localhost:3101" : undefined), app: getCollectionUrl() ?? undefined, contact: process.env.NEXT_PUBLIC_CONTACT_URL, telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL, social: process.env.NEXT_PUBLIC_X_URL });
  return (
    <LandingExperience
      appUrl={getCollectionUrl()}
      footerLinks={{ ...footerLinks, website: process.env.LANDING_SITE_ROLE === "rewards" ? footerLinks.website : "/" }}
      plannedRewards={plannedRewards}
      seasons={seasons.map(({ season, collections }) => ({
        season,
        colors: collections,
      }))}
    />
  );
}
