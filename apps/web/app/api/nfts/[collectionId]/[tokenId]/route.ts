import { isCollectionId } from "../../../../../lib/collections/model";
import { isNftTokenId } from "../../../../../lib/nfts/model";
import { getIndexedNft } from "../../../../../lib/nfts/repository";
import { readNftMetadata } from "../../../../../lib/nfts/metadata-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ collectionId: string; tokenId: string }> }) {
  const { collectionId, tokenId } = await params;
  if (!isCollectionId(collectionId) || !isNftTokenId(tokenId)) {
    return Response.json({ error: "Invalid NFT identifier." }, { status: 400, headers });
  }
  try {
    const record = await getIndexedNft(collectionId, tokenId);
    if (!record) return Response.json({ error: "This NFT was not found in a confirmed collection." }, { status: 404, headers });
    const metadata = await readNftMetadata(record);
    const { factoryAddress: _factory, maxSupply: _supply, blockNumber: _block, ownerWallet: _owner, burned: _burned, ...nft } = record;
    return Response.json({ ...metadata, nft }, { headers });
  } catch {
    return Response.json({ error: "This NFT's on-chain artwork is temporarily unavailable. Please try again." }, { status: 503, headers });
  }
}
