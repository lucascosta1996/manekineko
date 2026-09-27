export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "");
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && origin.hostname === "localhost")) throw new Error("Invalid public origin");
    const result = await fetch(new URL("/api/seasons/featured", origin), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!result.ok) throw new Error("Unavailable");
    const { collection: c } = await result.json();
    if (c === null) return Response.json({ collection: null }, { headers: { "Cache-Control": "no-store" } });
    if (!c || typeof c.name !== "string" || c.name.length > 160 || !/^\/(mint|seasons)\/[\da-z/-]+$/i.test(c.href) || !["live", "scheduled"].includes(c.status) || !Number.isFinite(Date.parse(c.target)) || !Number.isFinite(Date.parse(c.updatedAt)) || typeof c.stale !== "boolean") throw new Error("Invalid summary");
    return Response.json({ collection: { name: c.name, href: new URL(c.href, origin).href, status: c.status, target: c.target, updatedAt: c.updatedAt, stale: c.stale } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Live status unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
