import { issuePermit } from "../../../../../../lib/affiliates/service";
import { affiliateFailure, privateHeaders } from "../../../../../../lib/affiliates/http";
import { boundedJson, requireSameOrigin } from "../../../../../../lib/affiliates/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request:Request,context:{params:Promise<{collectionId:string}>}) {
  try { const origin=requireSameOrigin(request); const {collectionId}=await context.params;
    return Response.json({permit:await issuePermit(collectionId,request,await boundedJson(request),origin)},{headers:privateHeaders});
  } catch(error) { return affiliateFailure(error); }
}
