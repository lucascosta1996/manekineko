import { getAffiliateProgram } from "../../../../../lib/affiliates/service";
import { affiliateFailure, privateHeaders } from "../../../../../lib/affiliates/http";
import { AffiliateError } from "../../../../../lib/affiliates/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request,context:{params:Promise<{collectionId:string}>}) {
  try {
    const {collectionId}=await context.params; const params=new URL(request.url).searchParams;
    if(params.getAll("wallet").length>1||params.getAll("demoScenario").length>1||params.getAll("eligibilityPage").length>1) throw new AffiliateError("invalid_request","Duplicate affiliate parameters are not allowed.");
    const eligibilityPage = params.get("eligibilityPage") ?? "1";
    if (!/^[1-9][0-9]{0,4}$/.test(eligibilityPage) || Number(eligibilityPage)>10000) throw new AffiliateError("invalid_request","Choose a valid NFT results page.");
    return Response.json({program:await getAffiliateProgram(collectionId,params.get("wallet"),params.get("demoScenario"),Number(eligibilityPage))},{headers:privateHeaders});
  } catch(error) { return affiliateFailure(error); }
}
