import "@manekineko/ui/styles.css";
import "../../../../../apps/web/app/globals.css";
import "../../../../../apps/web/app/history/history.css";
import "../../../../../apps/web/app/my-nfts/nfts.css";
import "../../../../../apps/web/app/mint/[collectionId]/affiliates/affiliates.css";
import "../../../../../apps/web/app/docs/docs.css";
export const metadata = { title: "Tincta | Isolated visual specimens", robots: { index: false, follow: false } };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
