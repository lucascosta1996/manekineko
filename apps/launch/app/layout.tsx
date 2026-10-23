import type { Metadata } from 'next';
import '@manekineko/ui/styles.css';
import '@manekineko/protocol/styles.css';
import './globals.css';
export const metadata: Metadata = { title: 'Tincta | Season control', description: 'Wallet approvals and onchain season progress.', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
