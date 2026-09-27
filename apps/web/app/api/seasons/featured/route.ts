import { listCollections } from "../../../../lib/collections";
import { listAnnouncedSeasons } from "../../../../lib/seasons/schedule-repository";
import { featuredPublicCollection } from "../../../../lib/seasons/featured";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [collections, seasons] = await Promise.all([listCollections(), listAnnouncedSeasons()]);
    return Response.json({ collection: featuredPublicCollection(collections, seasons, Date.now()) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Live collection unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
