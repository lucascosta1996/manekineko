import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MintNotification } from "@manekineko/ui/mint-notification";
import "@manekineko/ui/styles.css";
import "./globals.css";
import "./compact.css";

export const metadata: Metadata = {
  title: "Tincta — Defined 100% onchain. Shaped by participation.",
  description:
    "Tincta researches and builds onchain projects with fixed rules for voting, collecting and publishing. Explore Rewards, Morph, Assembly and the TAS-1 proposal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<MintNotification /></body>
    </html>
  );
}
