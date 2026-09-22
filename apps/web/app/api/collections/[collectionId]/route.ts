import { getCollection, isCollectionId } from "../../../../lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ collectionId: string }> }) {
  const { collectionId } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!isCollectionId(collectionId)) return Response.json({ error: "Collection not found." }, { status: 404, headers });
  try {
    const collection = await getCollection(collectionId);
    return collection
      ? Response.json({ collection }, { headers })
      : Response.json({ error: "Collection not found." }, { status: 404, headers });
  } catch {
    console.error("Unable to read collection record from the configured repository.");
    return Response.json({ error: "Collection data is temporarily unavailable." }, { status: 503, headers });
  }
}
