import { ConfirmProvider } from "@manekineko/ui/confirm";
import type { Metadata } from "next";
import "@manekineko/ui/styles.css";
import "./globals.css";
import "./launch.css";
import "./automations.css";
import "./earnings.css";

import "./workspace.css";

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
      <body><ConfirmProvider>{children}</ConfirmProvider><footer className="dashboard-footer">Tincta · Private operator workspace</footer></body>
    </html>
  );
}
