export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
