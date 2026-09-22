import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tincta | Permanent numbers, verifiable results",
  description: "Preview Tincta V10: permanent Solidity-generated NFT combinations and artwork from mint, with scores and winning NFTs determined by one post-sellout VRF draw.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
