import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The adapter is loaded in a browser effect. Its Node-only optional wallet SDKs are not SSR code.
  serverExternalPackages: ["@reown/appkit-adapter-ethers"],
  transpilePackages: ["@manekineko/protocol", "@manekineko/ui"],
  async redirects() {
    return [
      { source: "/prizes", destination: "/claims", permanent: false },
      ...[
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
