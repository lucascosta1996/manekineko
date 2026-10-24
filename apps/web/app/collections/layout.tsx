import type { ReactNode } from 'react';
import { SiteShell } from '../../components/site-shell';
import './gallery.css';
export default function GalleryLayout({children}: {children: ReactNode}) {
  return <SiteShell section="nfts">{children}</SiteShell>;
}
