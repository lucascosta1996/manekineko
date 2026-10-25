import genesisArtwork from '../../../packages/ui/src/genesis-artwork.json';
import { buildTinctaPermanentSvg } from '@manekineko/contract-abi/tincta-artwork';
import { encodePermanentCombination } from '@manekineko/contract-abi/permanent-combinations';
import type { CollectionGallery, GalleryCollection } from '../lib/nft-mirror/model';
const key='0x'+'7'.repeat(64);
export const mirrorFixtureCollection: GalleryCollection = {
  chainId:11155111,address:'0x'+'2'.repeat(40),name:'Crimson interval',seasonName:'Color studies',
  color:'#330000',textColor:'#FFFFFF',minted:49,ready:49,cover:null,
  syncedAt:'2026-09-28T12:00:00.000Z',blockNumber:123456,catchingUp:false,
};
export function mirrorFixtureGallery(page=1, state='loaded'): CollectionGallery {
  const collection={...mirrorFixtureCollection,...(state==='mainnet'?{chainId:1}:{}),
    ...(state==='empty'?{minted:0,ready:0}:state==='syncing' || state==='backfill'?{minted:state==='backfill'?0:49,ready:0,catchingUp:true,syncedAt:null}: {})};
  return {page,collection,tokens:Array.from({length:Math.max(0,Math.min(24,collection.ready-(page-1)*24))},(_,i)=>{
    const tokenId=(page-1)*24+i+1;
    const identity=encodePermanentCombination(tokenId,key);
    const svg=buildTinctaPermanentSvg({seasonId:key,seasonName:collection.seasonName,collectionName:collection.name,
      collectionColor:collection.color,textColor:'#FFFFFF',tokenId,numbers:identity.numbers,combinationCode:identity.combinationCode});
    // Isolated renderer fixture. Production always displays the stored contract response.
    return {tokenId,name:`${collection.name} #${tokenId}`,image:`data:image/svg+xml,${encodeURIComponent(svg)}`,numbers:identity.numbers,burned:tokenId===2};
  })};
}

export const genesisFixtureCollection: GalleryCollection = {
  ...mirrorFixtureCollection,kind:'genesis',address:'0x'+'5'.repeat(40),name:'Tincta Genesis',seasonName:'Before the first season',
  color:'#FFFFFF',textColor:'#000000',minted:50,ready:50,cover:genesisArtwork.image,
};
export function genesisFixtureGallery(page=1,state='loaded'): CollectionGallery {
  const collection={...genesisFixtureCollection,...(state.includes('empty')?{minted:0,ready:0,cover:null}:state.includes('syncing')?{ready:0,cover:null,catchingUp:true}:{})};
  return {page,collection,tokens:Array.from({length:Math.max(0,Math.min(24,collection.ready-(page-1)*24))},(_,i)=>{
    const tokenId=(page-1)*24+i+1;
    const svg=atob(genesisArtwork.image.split(',')[1]).replace('#1 / 1000',`#${tokenId} / 1000`);
    return {tokenId,name:`Tincta Genesis #${tokenId}`,image:'data:image/svg+xml;base64,'+btoa(svg),numbers:[],burned:false};
  })};
}
