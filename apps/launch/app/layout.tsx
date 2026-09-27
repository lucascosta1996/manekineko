import type { Metadata } from "next";
import "./globals.css";
import "./launch.css";
import "./automations.css";
import "./earnings.css";

import "@manekineko/ui/styles.css";
import "./compact.css";

export const metadata: Metadata = {
  title: "Tincta | Launch workspace",
  description:
    "The private workspace for Tincta seasons, collections and launch settings.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<footer className="dashboard-footer">Tincta · Private operator workspace</footer></body>
    </html>
  );
}
