import { AffiliateError, authenticationData, authenticationDigest, ENROLLMENT_TYPES, ENROLLMENT_V4_TYPES, ENROLLMENT_V5_TYPES, ENROLLMENT_V6_TYPES, enrollmentNftSelection, verifyEoaAuthentication } from "./policy.ts";
import type { AffiliatePermit } from "./types.ts";

export interface EnrollmentChallengeRecord {
  id:string; collectionId:string; wallet:string; chainId:number; contractAddress:string; origin:string;
  eligibilitySourceAddress?:string|null; eligibilityTokenId?:string|null;
  nonce:string; ipDigest:string; expiresAt:Date; consumedAt:Date|null;
  contractVersion?:"affiliate-v3"|"affiliate-v4"|"affiliate-v5"|"affiliate-v6"|"affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10"; affiliateId?:number|null; commissionBps?:number|null;
}
export interface EnrollmentDependencies {
  now():number;
  verifyContractSignature(wallet:string,digest:string,signature:string):Promise<boolean>;
  verifyBot():Promise<void>;
  admitAuthenticatedWallet():Promise<void>;
  assertCanonical():Promise<void>;
  verifyEligibility?():Promise<void>;
  sign(domain:{name:string;version:string;chainId:number;verifyingContract:string},types:typeof ENROLLMENT_TYPES,message:{applicant:string;nonce:string;deadline:string;affiliateId?:number;commissionBps?:number;poolBps?:number;sourceCollection?:string;sourceTokenId?:string}):Promise<string>;
  consume():Promise<void>;
}
/** Financially inert until the atomic challenge consumption succeeds. Dependency injection exercises
 * the same production order under stale proofs, bot failures and concurrent serverless requests. */
export async function completeEnrollment(
  challenge:EnrollmentChallengeRecord,
  expected:{collectionId:string;chainId:number;contractAddress:string;origin:string;ipDigest:string;mintDeadline:bigint;contractVersion?:"affiliate-v3"|"affiliate-v4"|"affiliate-v5"|"affiliate-v6"|"affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";affiliateId?:number;commissionBps?:number;sourceCollection?:string;sourceTokenId?:string},
  signature:string,
  dependencies:EnrollmentDependencies,
):Promise<AffiliatePermit> {
  if(challenge.consumedAt||challenge.expiresAt.getTime()<=dependencies.now()||challenge.collectionId!==expected.collectionId||challenge.origin!==expected.origin||challenge.ipDigest!==expected.ipDigest||challenge.chainId!==expected.chainId||challenge.contractAddress!==expected.contractAddress) throw new AffiliateError("invalid_challenge","The challenge expired, was already used, or belongs to another enrollment. Request a new one.",409);
  const version=challenge.contractVersion??"affiliate-v3";
  if(version!==(expected.contractVersion??"affiliate-v3")||(version!=="affiliate-v3"&&(challenge.affiliateId!==expected.affiliateId||challenge.commissionBps!==expected.commissionBps||!Number.isInteger(challenge.affiliateId)||!Number.isInteger(challenge.commissionBps)||challenge.affiliateId!<1||challenge.affiliateId!>100||challenge.commissionBps!<0||challenge.commissionBps!>10000))) throw new AffiliateError("offer_changed","This position or commission no longer matches the signed enrollment offer. Request a new offer.",409);
  const offer=version!=="affiliate-v3"?{affiliateId:challenge.affiliateId!,commissionBps:challenge.commissionBps!}:undefined;
  const eligibility = (version === "affiliate-v6" || version === "affiliate-v7" || (version === "affiliate-v8" || version === "affiliate-v9" || version === "affiliate-v10")) ? enrollmentNftSelection(challenge.eligibilitySourceAddress, challenge.eligibilityTokenId) : undefined;
  if (eligibility && (eligibility.sourceCollection !== expected.sourceCollection || eligibility.sourceTokenId !== expected.sourceTokenId || !dependencies.verifyEligibility)) throw new AffiliateError("eligibility_changed", "The qualifying NFT no longer matches this enrollment. Request a fresh challenge.",409);
  const data=authenticationData(challenge.wallet,challenge.collectionId,challenge.origin,challenge.nonce,String(Math.floor(challenge.expiresAt.getTime()/1000)),challenge.chainId,challenge.contractAddress,offer,(version === "affiliate-v5" || (version === "affiliate-v6" || version === "affiliate-v7" || (version === "affiliate-v8" || version === "affiliate-v9" || version === "affiliate-v10"))),eligibility);
  // A delegated EIP-7702 EOA retains its signing key even though eth_getCode is nonempty.
  const authenticated=verifyEoaAuthentication(challenge.wallet,data,signature)||await dependencies.verifyContractSignature(challenge.wallet,authenticationDigest(data),signature);
  if(!authenticated) throw new AffiliateError("invalid_signature","The signature does not authorize this wallet and collection.",403);
  await dependencies.verifyBot();
  await dependencies.admitAuthenticatedWallet();
  if (eligibility) await dependencies.verifyEligibility!();
  await dependencies.assertCanonical();
  const deadline=String(Math.min(Math.floor(dependencies.now()/1000)+120,Math.floor(challenge.expiresAt.getTime()/1000),Number(expected.mintDeadline)));
  if(BigInt(deadline)<=BigInt(Math.floor(dependencies.now()/1000)+15)) throw new AffiliateError("invalid_challenge","The challenge is about to expire. Request a new one.",409);
  const message={applicant:challenge.wallet,nonce:challenge.nonce,deadline,...((version === "affiliate-v5" || (version === "affiliate-v6" || version === "affiliate-v7" || (version === "affiliate-v8" || version === "affiliate-v9" || version === "affiliate-v10"))) && offer ? {affiliateId:offer.affiliateId,poolBps:offer.commissionBps} : offer),...eligibility};
  const permitSignature=await dependencies.sign({name:"ManekinekoAffiliateEnrollment",version:(version === "affiliate-v6" || version === "affiliate-v7" || (version === "affiliate-v8" || version === "affiliate-v9" || version === "affiliate-v10"))?"4":version === "affiliate-v5"?"3":version==="affiliate-v4"?"2":"1",chainId:expected.chainId,verifyingContract:expected.contractAddress},(version === "affiliate-v6" || version === "affiliate-v7" || (version === "affiliate-v8" || version === "affiliate-v9" || version === "affiliate-v10"))?ENROLLMENT_V6_TYPES:version === "affiliate-v5"?ENROLLMENT_V5_TYPES:version==="affiliate-v4"?ENROLLMENT_V4_TYPES:ENROLLMENT_TYPES,message);
  await dependencies.consume();
  return {...message,...offer,contractVersion:version,signature:permitSignature,chainId:expected.chainId,contractAddress:expected.contractAddress};
}
