import { listCollections } from "../../../lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ collections: await listCollections() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Unable to read collection catalog from the configured repository.");
    return Response.json({ error: "Collection data is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
