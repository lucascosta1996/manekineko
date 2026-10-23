import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@manekineko/protocol", "@manekineko/ui"],
  async redirects() {
    return [
      { source: "/prizes", destination: "/claims", permanent: false },
      ...[
        "/collections",
        "/vote",
        "/mint/:path*",
        "/seasons/:path*",
        "/history",
        "/my-nfts",
        "/nfts/:path*",
        "/operations",
      ].map((source) => ({ source, destination: "/", permanent: false })),
      ...[
        "minting",
        "my-nfts",
        "randomness",
        "faq",
        "glossary",
        "contracts",
      ].map((slug) => ({
        source: `/docs/${slug}`,
        destination: "/docs",
        permanent: false,
      })),
    ];
  },
};
export default nextConfig;
