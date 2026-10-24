import { notFound } from 'next/navigation';
import { CollectionGalleryView } from '../../../../components/nft-mirror/gallery';
import { galleryIdentity, galleryPage, NFT_PAGE_SIZE } from '../../../../lib/nft-mirror/model';
import { getCollectionGallery } from '../../../../lib/nft-mirror/repository';
export const dynamic = 'force-dynamic';
export const metadata = {title:'Minted NFTs · Tincta'};
export default async function Collection({params,searchParams}: {
  params: Promise<{chainId: string; address: string}>; searchParams: Promise<{page?: string | string[]}>;
}) {
  const {chainId,address} = await params;
  const identity = galleryIdentity(chainId,address);
  if (!identity) notFound();
  let page: number;
  try { page=galleryPage((await searchParams).page); } catch { notFound(); }
  const data = await getCollectionGallery(identity.chainId,identity.address,page);
  if (!data || (page>1 && (page-1)*NFT_PAGE_SIZE>=data.collection.ready)) notFound();
  return <CollectionGalleryView data={data} />;
}
