import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { AffiliateError, authenticationData, enrollmentNftSelection, ipDigest, normalizedWallet, trustedIp, validTurnstileResult } from "./policy";
import { affiliateReferralUrl, readAffiliateAccount } from "./account";
import { getAffiliateNftCandidates } from "./eligibility-repository";
import { trustedAffiliateEligibility } from "./eligibility-chain";
import { completeEnrollment } from "./enrollment";
import { createChallenge, consumeChallenge, demoRecord, demoReferralRecord, programRecord, rateLimit, readChallenge, type ProgramRecord } from "./repository";
import { enrollmentConfigured, enrollmentWallet, trustedSnapshot, type ChainSnapshot } from "./chain";
import { DEMO_SCENARIOS, type AffiliateChallenge, type AffiliatePermit, type AffiliateProgram, type AffiliateReferral, type DemoScenario, type AffiliateEnrollmentEligibility } from "./types";
import { enrollmentWindowClosed } from "./enrollment-window";
/** The versioned enrollment offer binds V4 personal rates or the V5 collection pool. */
function offerBps(record: ProgramRecord, id: number): number {
  return (record.contractVersion === "affiliate-v5" || (record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10"))) ? record.affiliatePoolBps! : record.affiliateRatesBps[id - 1];
}
function programBase(record: ProgramRecord): Pick<AffiliateProgram,"collectionId"|"collectionName"|"chainId"|"contractAddress"|"contractVersion"|"mode"|"maxSlots"|"prizeBps"|"affiliateRatesBps"|"affiliatePoolBps"|"mintPriceWei"|"maxSupply"> {
  return {collectionId:record.collectionId,collectionName:record.collectionName,chainId:record.chainId,contractAddress:record.contractAddress,contractVersion:record.contractVersion,mode:record.mode,maxSlots:record.maxSlots,prizeBps:record.prizeBps,affiliatePoolBps:record.affiliatePoolBps,affiliateRatesBps:record.affiliateRatesBps,mintPriceWei:record.mintPriceWei,maxSupply:record.maxSupply};
}
export async function getAffiliateProgram(collectionId: string, walletValue?: string | null, scenarioValue?: string | null, eligibilityPage = 1): Promise<AffiliateProgram> {
  const record = await programRecord(collectionId);
  if (record.mode === "demo") {
    if (scenarioValue && !DEMO_SCENARIOS.includes(scenarioValue as DemoScenario)) throw new AffiliateError("invalid_scenario", "Choose a valid affiliate example.");
    const scenario = (scenarioValue ?? "no_referrals") as DemoScenario;
    const fixture = await demoRecord(collectionId,scenario);
    const accrued=BigInt(fixture.accruedWei),claimed=BigInt(fixture.claimedWei);
    const offer=fixture.enrolledSlots<record.maxSlots?{affiliateId:fixture.enrolledSlots+1,commissionBps:offerBps(record,fixture.enrolledSlots+1)}:null;
    return {...programBase(record),commissionBps:offer?.commissionBps??0,enrollmentOffer:offer,source:"postgres-demo",enrolledSlots:fixture.enrolledSlots,availableSlots:record.maxSlots-fixture.enrolledSlots,enrollmentStatus:"unavailable",
      readiness:{canEnroll:false,canMint:false,canClaim:false,reason:"Fictional database example. No contract is deployed and no real earnings or transactions are available."},
      saleActivated:true,soldOut:fixture.soldOut,refundable:fixture.refundable,prizePaid:scenario==="paid",mintDeadline:null,totalMinted:fixture.soldOut?record.maxSupply:fixture.referredMints,
      totalAccruedWei:String(accrued),totalClaimedWei:String(claimed),snapshotBlock:null,snapshotBlockHash:null,enrollmentSigner:null,runtimeCodeHash:null,turnstileSiteKey:null,demoScenario:scenario,
      account:{wallet:fixture.wallet,affiliateId:fixture.affiliateId,commissionBps:offerBps(record,fixture.affiliateId),status:scenario,accruedWei:String(accrued),claimedWei:String(claimed),claimableWei:fixture.soldOut?String(accrued-claimed):"0",pendingWei:!fixture.soldOut&&!fixture.refundable?String(accrued):"0",referredMints:fixture.referredMints,referralUrl:affiliateReferralUrl(record,fixture.affiliateId)}};
  }
  if (scenarioValue) throw new AffiliateError("invalid_scenario", "Example balances are unavailable for live collections.");
  const wallet=walletValue?normalizedWallet(walletValue):undefined;
  const snapshot=await trustedSnapshot(record);
  const account=await readAffiliateAccount(snapshot,wallet);
  let enrollmentEligibility: AffiliateEnrollmentEligibility | undefined;
  if ((record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10"))) {
    if (!Number.isInteger(eligibilityPage) || eligibilityPage < 1 || eligibilityPage > 10000) throw new AffiliateError("invalid_request","Choose a valid NFT results page.");
    const gate = await trustedAffiliateEligibility(snapshot);
    enrollmentEligibility = { gateAddress:gate.gateAddress, runtimeCodeHash:gate.runtimeCodeHash, policy:gate.policy, sequence:gate.sequence, page:eligibilityPage, hasMore:false, tokens:[], reason:gate.reason };
    if (wallet && gate.policy === "nft_holder" && !gate.reason && account?.status === "unregistered" && !snapshot.saleActivated && !snapshot.refundable) {
      const holdings = await getAffiliateNftCandidates(record.chainId,record.collectionId,wallet,eligibilityPage);
      enrollmentEligibility.hasMore = holdings.hasMore;
      enrollmentEligibility.tokens = await Promise.all(holdings.items.map(async item=>{
        const selection = {sourceCollection:item.sourceCollection,sourceTokenId:item.sourceTokenId};
        return {...selection,collectionId:item.collectionId,collectionName:item.collectionName,...await gate.check(wallet,selection)};
      }));
    }
  }
  await snapshot.assertCanonical();
  const enrollmentStatus=snapshot.saleActivated||snapshot.refundable||enrollmentWindowClosed(record.contractVersion,record.saleStartAt,snapshot.blockTimestamp)?"closed":snapshot.affiliateCount>=record.maxSlots?"full":"open";
  const configured=record.enrollmentEnabled&&enrollmentConfigured(snapshot.enrollmentSigner);
  const canEnroll=configured&&!enrollmentEligibility?.reason&&enrollmentStatus==="open"&&(!account||account.status==="unregistered");
  const offer=enrollmentStatus==="open"&&snapshot.nextAvailableAffiliateId?{affiliateId:snapshot.nextAvailableAffiliateId,commissionBps:offerBps(record,snapshot.nextAvailableAffiliateId)}:null;
  return {...programBase(record),commissionBps:offer?.commissionBps??0,enrollmentOffer:offer,enrollmentEligibility,source:"ethereum",...((["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion ?? "")) ? {minAffiliateReferrals:record.minAffiliateReferrals,affiliatePayoutCapBps:record.affiliatePayoutCapBps,winnerCount:record.winnerCount,secondPrizeBps:record.secondPrizeBps,saleStartAt:record.saleStartAt?.toISOString(),qualifiedSlots:snapshot.equalPool?.qualifiedCount,equalShareWei:snapshot.equalPool?.equalShareWei,unallocatedPoolWei:snapshot.equalPool?.unallocatedWei}:{}),enrolledSlots:snapshot.affiliateCount,availableSlots:record.maxSlots-snapshot.affiliateCount,enrollmentStatus,
    readiness:{canEnroll,canMint:snapshot.saleActivated&&!snapshot.soldOut&&!snapshot.refundable&&(!record.saleStartAt||snapshot.blockTimestamp>=record.saleStartAt.getTime()/1000),canClaim:!!account&&BigInt(account.claimableWei)>0n,reason:enrollmentEligibility?.reason ?? (enrollmentStatus==="open"&&!configured?"Automated enrollment is not configured for this deployment yet.":null)},
    saleActivated:snapshot.saleActivated,soldOut:snapshot.soldOut,refundable:snapshot.refundable,prizePaid:snapshot.prizePaid,mintDeadline:new Date(Number(snapshot.mintDeadline)*1000).toISOString(),totalMinted:snapshot.totalMinted,totalReferredMints:snapshot.totalReferredMints,
    totalAccruedWei:String(snapshot.totalAccrued),totalClaimedWei:String(snapshot.totalClaimed),snapshotBlock:snapshot.blockNumber,snapshotBlockHash:snapshot.blockHash,enrollmentSigner:snapshot.enrollmentSigner,runtimeCodeHash:snapshot.codeHash,turnstileSiteKey:process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY??null,account,demoScenario:null};
}
export async function resolveAffiliate(collectionId: string, affiliateValue: string | null, contract: string | null): Promise<AffiliateReferral> {
  if (!affiliateValue || !/^[1-9][0-9]{0,2}$/.test(affiliateValue)) throw new AffiliateError("invalid_referral", "This referral position is invalid.");
  const id=Number(affiliateValue),record=await programRecord(collectionId);
  if (record.mode==="demo") {
    const fixture=await demoReferralRecord(collectionId,id);
    if (contract!=="demo"||id>record.maxSlots) throw new AffiliateError("invalid_referral", "This example referral does not belong to this collection.");
    return {collectionId,chainId:record.chainId,contractAddress:"demo",affiliateId:id,affiliateWallet:fixture.wallet,commissionBps:offerBps(record,id),prizeBps:record.prizeBps,affiliatePoolBps:record.affiliatePoolBps,contractVersion:record.contractVersion,mode:"demo",mintReady:false};
  }
  if (!contract||normalizedWallet(contract)!==record.contractAddress) throw new AffiliateError("invalid_referral", "This referral belongs to a different collection.");
  const snapshot=await trustedSnapshot(record);
  if (id>record.maxSlots) throw new AffiliateError("invalid_referral", "This affiliate position is not registered.");
  const wallet=normalizedWallet(await snapshot.call("affiliateWallet",[id]));
  await snapshot.assertCanonical();
  return {collectionId,chainId:record.chainId,contractAddress:record.contractAddress!,affiliateId:id,affiliateWallet:wallet,commissionBps:offerBps(record,id),prizeBps:record.prizeBps,affiliatePoolBps:record.affiliatePoolBps,contractVersion:record.contractVersion,mode:"live",mintReady:snapshot.saleActivated&&!snapshot.soldOut&&!snapshot.refundable&&(!record.saleStartAt||snapshot.blockTimestamp>=record.saleStartAt.getTime()/1000)};
}
async function openEnrollment(record: ProgramRecord, wallet: string): Promise<ChainSnapshot> {
  if (record.mode!=="live") throw new AffiliateError("demo_read_only", "This is a fictional example. Enrollment requires a deployed collection.", 409);
  const snapshot=await trustedSnapshot(record);
  if (!record.enrollmentEnabled||!enrollmentConfigured(snapshot.enrollmentSigner)) throw new AffiliateError("enrollment_unavailable", "Automated enrollment is not configured yet.",503);
  if (snapshot.saleActivated||snapshot.refundable||snapshot.affiliateCount>=record.maxSlots||enrollmentWindowClosed(record.contractVersion,record.saleStartAt,snapshot.blockTimestamp)) throw new AffiliateError("enrollment_closed", "Affiliate enrollment is closed or all positions are occupied.",409);
  if (BigInt(await snapshot.call("affiliateIdOf",[wallet]) as bigint)!==0n) throw new AffiliateError("already_enrolled", "This wallet already has a position in this collection.",409);
  await snapshot.assertCanonical();
  return snapshot;
}
export async function issueChallenge(collectionId:string,request:Request,body:Record<string,unknown>,origin:string):Promise<AffiliateChallenge> {
  const wallet=normalizedWallet(body.wallet),record=await programRecord(collectionId);
  collectionId=record.collectionId;
  if(record.mode!=="live") throw new AffiliateError("demo_read_only","This example cannot enroll a real wallet.",409);
  const digest=ipDigest(trustedIp(request),collectionId);
  await rateLimit(collectionId,"challenge_ip",digest,30);
  // An unauthenticated attacker must not spend another wallet's global quota.
  await rateLimit(collectionId,"challenge_wallet",`${digest}:${wallet}`,5);
  const snapshot=await openEnrollment(record,wallet);
  const offer=record.contractVersion!=="affiliate-v3"?{affiliateId:snapshot.nextAvailableAffiliateId,commissionBps:offerBps(record,snapshot.nextAvailableAffiliateId)}:undefined;
  if(offer&&(body.affiliateId!==offer.affiliateId||body.commissionBps!==offer.commissionBps)) throw new AffiliateError("offer_changed","The offered position changed. Review the new position and rate before signing.",409);
  const eligibility = (record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10")) ? enrollmentNftSelection(body.sourceCollection,body.sourceTokenId) : undefined;
  if (eligibility) { const gate = await trustedAffiliateEligibility(snapshot); await gate.assertEligible(wallet,eligibility); await snapshot.assertCanonical(); }
  const deadline=Math.min(Math.floor(Date.now()/1000)+300,Number(snapshot.mintDeadline));
  if(deadline<=Math.floor(Date.now()/1000)+30) throw new AffiliateError("enrollment_closed","There is not enough time remaining to enroll.",409);
  const nonce=`0x${randomBytes(32).toString("hex")}`,id=randomUUID(),expiresAt=new Date(deadline*1000);
  await createChallenge({id,collectionId:record.collectionId,wallet,chainId:record.chainId,contractAddress:record.contractAddress!,origin,nonce,ipDigest:digest,expiresAt,consumedAt:null,contractVersion:record.contractVersion,affiliateId:offer?.affiliateId??null,commissionBps:offer?.commissionBps??null,eligibilitySourceAddress:eligibility?.sourceCollection??null,eligibilityTokenId:eligibility?.sourceTokenId??null});
  return {contractVersion:record.contractVersion,...offer,...eligibility,challengeId:id,typedData:authenticationData(wallet,record.collectionId,origin,nonce,String(deadline),record.chainId,record.contractAddress!,offer,(record.contractVersion === "affiliate-v5" || (record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10"))),eligibility),expiresAt:expiresAt.toISOString(),turnstileAction:"affiliate_enrollment",turnstileCData:id};
}
export async function validateTurnstile(token:string,ip:string,origin:string,challengeId:string):Promise<void> {
  const secret=process.env.TURNSTILE_SECRET_KEY;
  if(!secret) throw new AffiliateError("enrollment_unavailable","Automated enrollment is not configured yet.",503);
  let response:Response;
  try { response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret,response:token,remoteip:ip}),cache:"no-store",signal:AbortSignal.timeout(10_000)}); }
  catch { throw new AffiliateError("verification_unavailable","Bot verification is temporarily unavailable. Please try again.",503); }
  if(!response.ok) throw new AffiliateError("verification_unavailable","Bot verification is temporarily unavailable. Please try again.",503);
  const result=await response.json();
  if(!validTurnstileResult(result,origin,challengeId)) throw new AffiliateError("verification_failed","Please complete a fresh bot verification for this enrollment.",403);
}
export async function issuePermit(collectionId:string,request:Request,body:Record<string,unknown>,origin:string):Promise<AffiliatePermit> {
  if(typeof body.challengeId!=="string"||typeof body.signature!=="string"||!/^0x[0-9a-fA-F]+$/.test(body.signature)||body.signature.length>8194||typeof body.turnstileToken!=="string"||body.turnstileToken.length<1||body.turnstileToken.length>2048) throw new AffiliateError("invalid_request","The enrollment proof is incomplete.");
  const record=await programRecord(collectionId);
  collectionId=record.collectionId;
  if(record.mode!=="live") throw new AffiliateError("demo_read_only","This example cannot issue a real enrollment permit.",409);
  const ip=trustedIp(request),digest=ipDigest(ip,collectionId);
  await rateLimit(collectionId,"permit_ip",digest,3);
  const challenge=await readChallenge(body.challengeId,record.collectionId);
  const snapshot=await openEnrollment(record,challenge.wallet);
  if(record.contractVersion!=="affiliate-v3"&&(!challenge.affiliateId||challenge.affiliateId>record.maxSlots||String(await snapshot.call("affiliateWallet",[challenge.affiliateId])).toLowerCase()!=="0x0000000000000000000000000000000000000000")) throw new AffiliateError("offer_taken","This position was enrolled by another wallet. Review a new offer; your commission will not be changed silently.",409);
  const eligibility = (record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10")) ? enrollmentNftSelection(challenge.eligibilitySourceAddress,challenge.eligibilityTokenId) : undefined;
  return completeEnrollment(challenge,{...eligibility,collectionId:record.collectionId,chainId:record.chainId,contractAddress:record.contractAddress!,origin,ipDigest:digest,mintDeadline:snapshot.mintDeadline,contractVersion:record.contractVersion,affiliateId:challenge.affiliateId??undefined,commissionBps:challenge.affiliateId?offerBps(record,challenge.affiliateId):undefined},body.signature,{
    now:Date.now,verifyContractSignature:snapshot.verifyContractSignature,
    ...(eligibility ? {verifyEligibility:async()=>{
      // Bot verification can take time: re-read ownership, consumed NFT and enrollment state immediately before signing.
      const fresh = await openEnrollment(record,challenge.wallet);
      const gate = await trustedAffiliateEligibility(fresh);
      await gate.assertEligible(challenge.wallet,eligibility);
      if (String(await fresh.call("affiliateWallet",[challenge.affiliateId])).toLowerCase()!=="0x0000000000000000000000000000000000000000") throw new AffiliateError("offer_taken","This affiliate position has already been filled.",409);
      await fresh.assertCanonical();
    }} : {}),
    admitAuthenticatedWallet:()=>rateLimit(collectionId,"permit_wallet",challenge.wallet,5),
    verifyBot:()=>validateTurnstile(body.turnstileToken as string,ip,origin,challenge.id),assertCanonical:snapshot.assertCanonical,
    sign:(domain,types,message)=>enrollmentWallet().signTypedData(domain,types,message),consume:()=>consumeChallenge(challenge),
  });
}
