export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "");
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && origin.hostname === "localhost")) throw new Error("Invalid public origin");
    const result = await fetch(new URL("/api/seasons/featured", origin), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!result.ok) throw new Error("Unavailable");
    const { collection: c } = await result.json();
    return Response.json({ collection: parseLiveCollection(c, origin) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Live status unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
import { parseLiveCollection } from "../../../lib/live-collection";
