import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getAddress, TypedDataEncoder, verifyTypedData } from "ethers";
import type { AuthenticationTypedData, AffiliateStatus, AffiliateNftSelection } from "./types.ts";

export class AffiliateError extends Error {
  code: string;
  status: number;
  retryAfter?: number;
  constructor(code: string, message: string, status = 400, retryAfter?: number) { super(message); this.code=code; this.status=status; this.retryAfter=retryAfter; }
}
export function normalizedWallet(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new AffiliateError("invalid_wallet", "Enter a valid Ethereum wallet address.");
  try { const address = getAddress(value).toLowerCase(); if (/^0x0{40}$/.test(address)) throw new Error(); return address; }
  catch { throw new AffiliateError("invalid_wallet", "Enter a valid Ethereum wallet address."); }
}
export function affiliateStatus(accrued: bigint, claimed: bigint, soldOut: boolean, refundable: boolean, referredMints=0): AffiliateStatus {
  if (refundable) return "refunded";
  if (accrued === 0n) return referredMints>0?"no_commission":"no_referrals";
  if (!soldOut) return "pending_sellout";
  return accrued > claimed ? "claimable" : "paid";
}
export function configuredOrigin(env: Record<string,string|undefined> = process.env): string {
  try {
    const url = new URL(env.AFFILIATE_PUBLIC_ORIGIN ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new AffiliateError("enrollment_unavailable", "Affiliate enrollment is not configured yet.", 503); }
}
export function requireSameOrigin(request: Request, env: Record<string,string|undefined> = process.env): string {
  const origin = configuredOrigin(env);
  if (request.headers.get("origin") !== origin || new URL(request.url).origin !== origin) throw new AffiliateError("wrong_origin", "Open enrollment from the official collection website.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AffiliateError("invalid_content_type", "Send a JSON request.", 415);
  return origin;
}
/** Only Vercel's platform-controlled header is trusted; never accept client body IPs or generic XFF. */
export function trustedIp(request: Request, env: Record<string,string|undefined> = process.env): string {
  if (env.VERCEL !== "1" || env.AFFILIATE_TRUSTED_PROXY !== "vercel") throw new AffiliateError("enrollment_unavailable", "Enrollment requires the configured trusted network gateway.", 503);
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) throw new AffiliateError("network_unavailable", "Your network address could not be verified. Please try again.", 503);
  // URL normalizes equivalent IPv6 spellings so changing their notation cannot bypass a counter.
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase() : ip;
}
export function ipDigest(ip: string, collectionId: string, env: Record<string,string|undefined> = process.env): string {
  const secret = env.AFFILIATE_IP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new AffiliateError("enrollment_unavailable", "Affiliate enrollment is not configured yet.", 503);
  return createHmac("sha256", secret).update(`${collectionId.toLowerCase()}:${ip}`).digest("hex");
}
export const AUTHENTICATION_TYPES = { Authentication: [
  { name: "applicant", type: "address" }, { name: "collectionId", type: "string" },
  { name: "origin", type: "string" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };
export const ENROLLMENT_TYPES = { Enrollment: [
  { name: "applicant", type: "address" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };
export const AUTHENTICATION_V4_TYPES = { Authentication: [
  ...AUTHENTICATION_TYPES.Authentication.slice(0,3),
  {name:"affiliateId",type:"uint256"},{name:"commissionBps",type:"uint256"},
  ...AUTHENTICATION_TYPES.Authentication.slice(3),
] };
export const ENROLLMENT_V4_TYPES = { Enrollment: [
  {name:"applicant",type:"address"},{name:"affiliateId",type:"uint256"},{name:"commissionBps",type:"uint256"},
  {name:"nonce",type:"bytes32"},{name:"deadline",type:"uint256"},
] };
export const AUTHENTICATION_V5_TYPES = { Authentication: AUTHENTICATION_V4_TYPES.Authentication.map(field => field.name === "commissionBps" ? { ...field, name: "poolBps" } : field) };
export const ENROLLMENT_V5_TYPES = { Enrollment: ENROLLMENT_V4_TYPES.Enrollment.map(field => field.name === "commissionBps" ? { ...field, name: "poolBps" } : field) };
export const AUTHENTICATION_V6_TYPES = { Authentication: [
  ...AUTHENTICATION_V5_TYPES.Authentication.slice(0, 5),
  { name: "sourceCollection", type: "address" }, { name: "sourceTokenId", type: "uint256" },
  ...AUTHENTICATION_V5_TYPES.Authentication.slice(5),
] };
export const ENROLLMENT_V6_TYPES = { Enrollment: [
  ...ENROLLMENT_V5_TYPES.Enrollment.slice(0, 3),
  { name: "sourceCollection", type: "address" }, { name: "sourceTokenId", type: "uint256" },
  ...ENROLLMENT_V5_TYPES.Enrollment.slice(3),
] };
export function enrollmentNftSelection(sourceCollection: unknown, sourceTokenId: unknown): AffiliateNftSelection {
  if (typeof sourceCollection !== "string" || !/^0x[0-9a-f]{40}$/i.test(sourceCollection) || typeof sourceTokenId !== "string" || !/^(0|[1-9][0-9]{0,4})$/.test(sourceTokenId) || BigInt(sourceTokenId) > 65536n
    || (/^0x0{40}$/i.test(sourceCollection) !== (sourceTokenId === "0"))) throw new AffiliateError("invalid_eligibility", "Choose a valid qualifying NFT, or the bootstrap enrollment option.");
  return { sourceCollection: sourceCollection.toLowerCase(), sourceTokenId };
}
export function validateAffiliatePool(prizeBps: number, poolBps: number | null | undefined, maxSlots: number, rates: readonly number[]): void {
  if (!Number.isInteger(prizeBps) || prizeBps < 0 || !Number.isInteger(poolBps) || poolBps! < 0 || prizeBps + poolBps! > 10_000 || !Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > 100 || rates.length !== 0) throw new AffiliateError("invalid_terms", "The collection pool and winner share must fit within total mint revenue.", 503);
}
export function authenticationData(applicant: string, collectionId: string, origin: string, nonce: string, deadline: string, chainId: number, contract: string,offer?:{affiliateId:number;commissionBps:number}, pool = false, eligibility?: AffiliateNftSelection): AuthenticationTypedData {
  if (pool && !offer) throw new AffiliateError("invalid_offer", "A pool enrollment must bind its exact position and pool terms.");
  if (eligibility && !pool) throw new AffiliateError("invalid_offer", "Holder enrollment must bind its exact pool terms.");
  const selected = eligibility ? enrollmentNftSelection(eligibility.sourceCollection, eligibility.sourceTokenId) : undefined;
  const terms = pool && offer ? { affiliateId: offer.affiliateId, poolBps: offer.commissionBps } : offer;
  return { domain: { name: "ManekinekoAffiliateAuthentication", version: selected?"4":pool?"3":offer?"2":"1", chainId, verifyingContract: contract }, types: selected?AUTHENTICATION_V6_TYPES:pool?AUTHENTICATION_V5_TYPES:offer?AUTHENTICATION_V4_TYPES:AUTHENTICATION_TYPES, primaryType: "Authentication", message: { applicant, collectionId, origin, nonce, deadline,...terms,...selected } };
}
export function validateAffiliateRates(prizeBps:number,rates:number[],maxSlots:number):void {
  if(!Number.isInteger(prizeBps)||prizeBps<0||prizeBps>10000||!Number.isInteger(maxSlots)||maxSlots<1||maxSlots>100||rates.length!==maxSlots
    ||rates.some(rate=>!Number.isInteger(rate)||rate<0||rate>10000||rate+prizeBps>10000)) throw new AffiliateError("invalid_terms","Affiliate rates must fit within the operator's portion of each referred purchase.",503);
}
export function authenticationDigest(data: AuthenticationTypedData): string { return TypedDataEncoder.hash(data.domain, data.types, data.message); }
export function verifyEoaAuthentication(wallet: string, data: AuthenticationTypedData, signature: string): boolean {
  try { return verifyTypedData(data.domain, data.types, data.message, signature).toLowerCase() === wallet.toLowerCase(); } catch { return false; }
}
export function validTurnstileResult(result: Record<string,unknown>, origin: string, challengeId: string, now = Date.now()): boolean {
  const age=now-Date.parse(String(result.challenge_ts));
  return result.success===true&&result.hostname===new URL(origin).hostname&&result.action==="affiliate_enrollment"&&result.cdata===challengeId&&Number.isFinite(age)&&age>=-30_000&&age<=300_000;
}
export async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 12_288) throw new AffiliateError("request_too_large", "Request is too large.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new AffiliateError("invalid_request", "A JSON request body is required.");
  let size = 0; const parts: Uint8Array[] = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 12_288) { await reader.cancel(); throw new AffiliateError("request_too_large", "Request is too large.", 413); } parts.push(value); }
  try { const value = JSON.parse(Buffer.concat(parts).toString("utf8")); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new AffiliateError("invalid_request", "The request must contain a JSON object."); }
}
