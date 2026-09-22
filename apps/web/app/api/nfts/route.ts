import { NftQueryError, parseNftGalleryQuery } from "../../../lib/nfts/model";
import { getNftGallery } from "../../../lib/nfts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = parseNftGalleryQuery(new URL(request.url).searchParams);
    return Response.json(await getNftGallery(query), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NftQueryError) {
      return Response.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Unable to read indexed NFTs from the database.");
    return Response.json({ error: "Your NFTs are temporarily unavailable. Please try again." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
