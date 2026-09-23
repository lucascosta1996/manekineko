import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tincta — Autonomous rewards. Verifiable onchain.",
  description:
    "Prizes and affiliate commissions controlled by smart contracts. Explore planned ETH rewards, onchain rules, and direct claims. Join the Tincta launch list.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
