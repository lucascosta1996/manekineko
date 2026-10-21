import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: process.env.LANDING_SITE_ROLE === "rewards"
        ? [{ source: "/", destination: "/rewards" }]
        : [],
    };
  },
  async redirects() {
    if (process.env.LANDING_SITE_ROLE !== "studio") return [];
    const rewardsUrl = new URL(process.env.REWARDS_PUBLIC_URL ?? "https://rewards.tincta.xyz");
    if (rewardsUrl.protocol !== "https:") throw new Error("REWARDS_PUBLIC_URL must use HTTPS");
    return [{ source: "/rewards", destination: rewardsUrl.href, permanent: false }];
  },
};

export default nextConfig;
