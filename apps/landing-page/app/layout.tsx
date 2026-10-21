import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@manekineko/ui/styles.css";
import "./globals.css";
import "./compact.css";

export const metadata: Metadata = {
  title: "Tincta — Defined by code. Shaped by participation.",
  description:
    "Tincta is a research and publishing studio exploring programmable markets, digital collections, and participant-driven outcomes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
