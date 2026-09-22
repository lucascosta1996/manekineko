import { WinnerCreditQueryError, parseWinnerCreditQuery } from "../../../lib/winner-credits/model";
import { getWinnerCredits } from "../../../lib/winner-credits/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await getWinnerCredits(parseWinnerCreditQuery(new URL(request.url).searchParams)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof WinnerCreditQueryError) return Response.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    console.error("Unable to verify winner credits.");
    return Response.json({ error: "Winner credits cannot be verified right now. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
