import "@manekineko/ui/styles.css";
import "../../../../../apps/web/app/globals.css";
import "../../../../../apps/web/app/collections/gallery.css";
import "../../../../../apps/web/app/history/history.css";
import "../../../../../apps/web/app/my-nfts/nfts.css";
import "../../../../../apps/web/app/mint/[collectionId]/affiliates/affiliates.css";
import "../../../../../apps/web/app/docs/docs.css";
import { WebWalletProvider } from "@manekineko/protocol/web-wallet-provider";
export const metadata = { title: "Tincta | Isolated visual specimens", robots: { index: false, follow: false } };
// Synthetic public identifier: network calls are intercepted by the isolated browser harness.
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body><WebWalletProvider defaultChainId={11155111} projectId="11111111111111111111111111111111">{children}</WebWalletProvider></body></html>; }
