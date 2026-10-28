export const NFT_PAGE_SIZE = 24;
export interface MirrorPin { chainId: number; controller: string; codeHash: string; version: 12 | 13 | 14 | 16 | 17 }
export interface GalleryCollection {
  collectionId?: number; kind?: 'paid' | 'genesis'; chainId: number; address: string; name: string; seasonName: string;
  color: string; textColor: string; minted: number; ready: number;
  cover: string | null; syncedAt: string | null; blockNumber: number | null; catchingUp: boolean;
}
export interface GalleryNft {
  tokenId: number; name: string; image: string; numbers: number[]; burned: boolean;
}
export interface CollectionDirectory { configured: boolean; page: number; total: number; collections: GalleryCollection[]; genesis?: GalleryCollection[] }
export interface CollectionGallery { page: number; collection: GalleryCollection; tokens: GalleryNft[] }
export function galleryPage(value: string | string[] | undefined): number {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value) || Number(value)>Math.ceil(65536/NFT_PAGE_SIZE)) throw new Error('Invalid page.');
  return Number(value);
}
export function galleryPath(chainId: number, address: string, collectionId?:number): string {
  return `/collections/${chainId}/${address.toLowerCase()}${collectionId===undefined?"":`?collection=${collectionId}`}`;
}
export function galleryIdentity(chainId: string, address: string): {chainId: number; address: string} | null {
  if (!['1','11155111'].includes(chainId) || !/^0x[0-9a-f]{40}$/i.test(address) || /^0x0{40}$/i.test(address)) return null;
  return {chainId:Number(chainId),address:address.toLowerCase()};
}
