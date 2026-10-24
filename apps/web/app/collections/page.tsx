import { notFound } from 'next/navigation';
import { CollectionDirectoryView } from '../../components/nft-mirror/gallery';
import { galleryPage, NFT_PAGE_SIZE } from '../../lib/nft-mirror/model';
import { getCollectionDirectory } from '../../lib/nft-mirror/repository';
export const dynamic = 'force-dynamic';
export const metadata = {title:'Collections · Tincta'};
export default async function Collections({searchParams}: {searchParams: Promise<{page?: string | string[]}>}) {
  let page: number;
  try { page=galleryPage((await searchParams).page); } catch { notFound(); }
  const data = await getCollectionDirectory(page);
  if (page>1 && (page-1)*NFT_PAGE_SIZE>=data.total) notFound();
  return <CollectionDirectoryView data={data} />;
}
