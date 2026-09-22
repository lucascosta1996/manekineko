export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ service: "manekineko-indexer" }, { headers: { "Cache-Control": "no-store" } });
}
