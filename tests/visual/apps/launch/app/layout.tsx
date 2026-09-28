import "@manekineko/ui/styles.css";
import "../../../../../apps/launch/app/globals.css";
import "../../../../../apps/launch/app/launch.css";
import "../../../../../apps/launch/app/automations.css";
import "../../../../../apps/launch/app/earnings.css";
import "../../../../../apps/launch/app/workspace.css";
export const metadata = { title: "Tincta | Launch workspace", robots: { index: false, follow: false } };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
