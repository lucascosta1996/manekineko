import { AffiliateError, validTurnstileResult } from "./policy.ts";

/** No token, secret, wallet, IP or raw provider payload may enter diagnostics. */
export function turnstileDiagnostic(result: Record<string,unknown>, origin:string, challengeId:string) {
  const known = new Set(["missing-input-secret","invalid-input-secret","missing-input-response","invalid-input-response","bad-request","timeout-or-duplicate","internal-error"]);
  const errorCodes = Array.isArray(result["error-codes"]) ? result["error-codes"].filter((c):c is string=>typeof c==="string"&&known.has(c)) : [];
  return {event:"affiliate_verification_failed",errorCodes,
    reason:result.success!==true?"provider_rejected":result.hostname!==new URL(origin).hostname?"hostname_mismatch":result.action!=="affiliate_enrollment"?"action_mismatch":result.cdata!==challengeId?"challenge_mismatch":"expired_timestamp"};
}
export async function validateTurnstile(token:string,ip:string,origin:string,challengeId:string,dependencies={fetch:globalThis.fetch,secret:process.env.TURNSTILE_SECRET_KEY,warn:(detail:unknown)=>console.warn(JSON.stringify(detail))}):Promise<void> {
  if(!dependencies.secret)throw new AffiliateError("enrollment_unavailable","Enrollment is temporarily unavailable. Please check again later.",503);
  let result:Record<string,unknown>;
  try {
    const response=await dependencies.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:dependencies.secret,response:token,remoteip:ip,idempotency_key:challengeId}),cache:"no-store",signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw new Error();
    result=await response.json();
    if(!result||typeof result!=="object"||Array.isArray(result))throw new Error();
  }catch{throw new AffiliateError("verification_unavailable","Human verification is temporarily unavailable. Request a fresh enrollment check and try again.",503);}
  if(!validTurnstileResult(result,origin,challengeId)){
    const diagnostic=turnstileDiagnostic(result,origin,challengeId);dependencies.warn(diagnostic);
    if(diagnostic.errorCodes.some(c=>c.includes("input-secret")))throw new AffiliateError("verification_unavailable","Enrollment verification needs a configuration fix. Please try again after the service is restored.",503);
    throw new AffiliateError("verification_failed","Human verification expired or was rejected. Request a fresh enrollment check and try again.",403);
  }
}
