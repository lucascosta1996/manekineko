import "server-only";
import { AffiliateError } from "./policy";
export const privateHeaders = { "Cache-Control":"private, no-store", "Vary":"Origin", "X-Content-Type-Options":"nosniff" };
export function affiliateFailure(error:unknown):Response {
  if(error instanceof AffiliateError) return Response.json({error:error.message,code:error.code,...(error.retryAfter?{retryAfter:error.retryAfter}:{})},{status:error.status,headers:{...privateHeaders,...(error.retryAfter?{"Retry-After":String(error.retryAfter)}:{})}});
  console.error("Affiliate request failed: a database or verified external dependency was unavailable.");
  return Response.json({error:"Affiliate data is temporarily unavailable. Please try again shortly.",code:"temporarily_unavailable"},{status:503,headers:privateHeaders});
}
