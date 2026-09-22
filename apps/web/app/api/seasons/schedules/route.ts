import { listAnnouncedSeasons } from "../../../../lib/seasons/schedule-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ seasons: await listAnnouncedSeasons() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Season announcements are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
