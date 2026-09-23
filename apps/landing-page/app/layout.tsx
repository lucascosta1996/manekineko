import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tincta — Real art. Real rewards.",
  description:
    "Original onchain art. Real ETH prizes. Rewards for growing the community. Discover the rewards planned across 22 Tincta seasons and join the launch list.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
