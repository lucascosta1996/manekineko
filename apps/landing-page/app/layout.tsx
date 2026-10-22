import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@manekineko/ui/styles.css";
import "./globals.css";
import "./compact.css";

export const metadata: Metadata = {
  title: "Tincta — Defined 100% onchain. Shaped by participation.",
  description:
    "We build open systems where immutable code sets the rules—and participation creates what comes next. Explore Tincta’s research and onchain projects.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
