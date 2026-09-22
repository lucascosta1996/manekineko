import { getHistory } from "../../../lib/history/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getHistory(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Unable to read collection history from the database.");
    return Response.json(
      { error: "Collection history is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
