import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = { devIndicators: false, turbopack: { root: path.resolve(__dirname, "../../../..") }, transpilePackages: ["@manekineko/ui", "@manekineko/contract-abi"] };
export default config;
