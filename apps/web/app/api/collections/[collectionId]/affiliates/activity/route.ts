import { referralActivity } from "../../../../../../lib/affiliates/referral-activity-repository";
import { affiliateFailure, privateHeaders } from "../../../../../../lib/affiliates/http";
import { AffiliateError } from "../../../../../../lib/affiliates/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ collectionId: string }> }) {
  try {
    const { collectionId } = await context.params, query = new URL(request.url).searchParams;
    if (query.getAll("wallet").length !== 1) throw new AffiliateError("invalid_wallet", "Choose one affiliate wallet.");
    return Response.json(await referralActivity(collectionId, query.get("wallet")!), { headers: privateHeaders });
  } catch (error) { return affiliateFailure(error); }
}
