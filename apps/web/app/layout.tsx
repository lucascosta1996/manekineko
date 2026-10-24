import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WebWalletProvider } from "@manekineko/protocol/web-wallet-provider";
import { protocolConfig } from "../lib/protocol/config";
import "@manekineko/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tincta | On-chain rewards",
  description:
    "Explore community-voted terms, ETH prizes, affiliate rewards and season holder pools. Each deployed collection retains its own contract rules.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><WebWalletProvider defaultChainId={protocolConfig()?.chainId ?? 1}>{children}</WebWalletProvider></body>
    </html>
  );
}
