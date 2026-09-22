import { resolveAffiliate } from "../../../../../../lib/affiliates/service";
import { affiliateFailure, privateHeaders } from "../../../../../../lib/affiliates/http";
import { AffiliateError } from "../../../../../../lib/affiliates/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request,context:{params:Promise<{collectionId:string}>}) {
  try {
    const {collectionId}=await context.params; const params=new URL(request.url).searchParams;
    if(params.getAll("affiliate").length!==1||params.getAll("collection").length!==1) throw new AffiliateError("invalid_referral","A referral must identify one collection and one affiliate position.");
    return Response.json({referral:await resolveAffiliate(collectionId,params.get("affiliate"),params.get("collection"))},{headers:privateHeaders});
  } catch(error) { return affiliateFailure(error); }
}
