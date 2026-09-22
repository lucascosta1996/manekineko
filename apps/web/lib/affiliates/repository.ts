import "server-only";
import { createHash } from "node:crypto";
import { database } from "../database";
import { chainEnabled } from "../chain-policy";
import { isCollectionId } from "../collections/model";
import { AffiliateError, validateAffiliatePool, validateAffiliateRates } from "./policy";
import type { DemoScenario } from "./types";
import { AFFILIATE_CONSUME_SQL, AFFILIATE_RATE_SQL } from "./queries";

export interface ProgramRecord {
  minAffiliateReferrals?: number; affiliatePayoutCapBps?: number; winnerCount?: number; secondPrizeBps?: number; saleStartAt?: Date;
  collectionId: string; collectionName: string; chainId: number; roundId: string;
  mode: "demo" | "live"; maxSlots: number; enrollmentEnabled: boolean; enrollmentSigner: string | null;
  contractAddress: string | null; factoryAddress: string | null; deploymentStatus: string;
  mintPriceWei: string; maxSupply: number; algorithmVersion: string; mintDeadline: Date | null;
  contractVersion:"affiliate-v3"|"affiliate-v4"|"affiliate-v5"|"affiliate-v6"|"affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";collectionContractVersion:string;prizeBps:number;affiliateRatesBps:number[];affiliatePoolBps:number|null;
}
export async function programRecord(collectionId: string): Promise<ProgramRecord> {
  if (!isCollectionId(collectionId)) throw new AffiliateError("not_found", "Collection not found.", 404);
  if (!process.env.DATABASE_URL) throw new AffiliateError("database_unavailable", "Affiliate data requires the configured database.", 503);
  const result = await database().query<ProgramRecord>(`SELECT p.collection_id AS "collectionId",c.name AS "collectionName",c.chain_id::integer AS "chainId",c.round_id::text AS "roundId",
    c.min_affiliate_referrals AS "minAffiliateReferrals",c.affiliate_payout_cap_bps AS "affiliatePayoutCapBps",c.winner_count AS "winnerCount",c.second_prize_bps AS "secondPrizeBps",c.sale_start_at AS "saleStartAt",
    p.mode,p.contract_version AS "contractVersion",c.contract_version AS "collectionContractVersion",c.prize_bps AS "prizeBps",c.affiliate_pool_bps AS "affiliatePoolBps",p.affiliate_rates_bps AS "affiliateRatesBps",p.max_slots AS "maxSlots",p.enrollment_enabled AS "enrollmentEnabled",p.enrollment_signer AS "enrollmentSigner",
    d.contract_address AS "contractAddress",d.factory_address AS "factoryAddress",d.status AS "deploymentStatus",
    c.mint_price_wei::text AS "mintPriceWei",c.max_supply AS "maxSupply",c.algorithm_version AS "algorithmVersion",d.mint_deadline AS "mintDeadline"
    FROM manekineko_affiliate_programs p JOIN manekineko_collections c ON c.id=p.collection_id
    LEFT JOIN manekineko_deployments d ON d.collection_id=p.collection_id WHERE p.collection_id=$1::uuid`, [collectionId]);
  if (!result.rows[0]) throw new AffiliateError("not_found", "This collection does not have an affiliate program.", 404);
  const record = result.rows[0];
  if (!chainEnabled(record.chainId)) throw new AffiliateError("not_found", "This collection is not available on this network.", 404);
  if ((record.contractVersion === "affiliate-v5" || (record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10")))) validateAffiliatePool(record.prizeBps, record.affiliatePoolBps, record.maxSlots, record.affiliateRatesBps);
  else validateAffiliateRates(record.prizeBps, record.affiliateRatesBps, record.maxSlots);
  return result.rows[0];
}
export interface DemoRecord { wallet: string; affiliateId: number; enrolledSlots: number; accruedWei: string; claimedWei: string; soldOut: boolean; refundable: boolean;referredMints:number }
export async function demoRecord(collectionId: string, scenario: DemoScenario): Promise<DemoRecord> {
  const result = await database().query<DemoRecord>(`SELECT wallet,affiliate_id AS "affiliateId",enrolled_slots AS "enrolledSlots",accrued_wei::text AS "accruedWei",claimed_wei::text AS "claimedWei",sold_out AS "soldOut",refundable,referred_mints AS "referredMints"
    FROM manekineko_affiliate_demo_accounts WHERE collection_id=$1::uuid AND scenario=$2`, [collectionId, scenario]);
  if (!result.rows[0]) throw new AffiliateError("demo_unavailable", "This affiliate example is unavailable in the database.", 503);
  return result.rows[0];
}
export async function demoReferralRecord(collectionId:string,affiliateId:number):Promise<{wallet:string}> {
  const result=await database().query<{wallet:string}>(`SELECT DISTINCT wallet FROM manekineko_affiliate_demo_accounts WHERE collection_id=$1::uuid AND affiliate_id=$2`,[collectionId,affiliateId]);
  if(result.rows.length!==1) throw new AffiliateError("invalid_referral","This example referral position is not registered for this collection.");
  return result.rows[0];
}
/** A failed admission attempt counts too; never roll back throttling with a failed signature check. */
export async function rateLimit(collectionId: string, scope: "challenge_ip" | "challenge_wallet" | "permit_ip" | "permit_wallet", subject: string, limit: number): Promise<void> {
  const hash = createHash("sha256").update(subject).digest("hex");
  const result = await database().query(AFFILIATE_RATE_SQL, [collectionId, scope, hash, limit]);
  if (result.rowCount !== 1) throw new AffiliateError("rate_limited", "Too many enrollment attempts from this wallet or network. Please try again in ten minutes.", 429, 600);
}
export interface ChallengeRecord { id: string; collectionId: string; wallet: string; chainId: number; contractAddress: string; origin: string; nonce: string; ipDigest: string; expiresAt: Date; consumedAt: Date | null; contractVersion:"affiliate-v3"|"affiliate-v4"|"affiliate-v5"|"affiliate-v6"|"affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10";affiliateId:number|null;commissionBps:number|null;eligibilitySourceAddress:string|null;eligibilityTokenId:string|null }
export async function readChallenge(id: string, collectionId: string): Promise<ChallengeRecord> {
  if (!isCollectionId(id)) throw new AffiliateError("invalid_challenge", "Request a new enrollment challenge.");
  const result = await database().query<ChallengeRecord>(`SELECT id,collection_id AS "collectionId",wallet,chain_id::integer AS "chainId",contract_address AS "contractAddress",origin,nonce,ip_digest AS "ipDigest",expires_at AS "expiresAt",consumed_at AS "consumedAt",contract_version AS "contractVersion",affiliate_id AS "affiliateId",commission_bps AS "commissionBps",eligibility_source_address AS "eligibilitySourceAddress",eligibility_token_id::text AS "eligibilityTokenId"
    FROM manekineko_affiliate_challenges WHERE id=$1::uuid AND collection_id=$2::uuid`, [id,collectionId]);
  if (!result.rows[0]) throw new AffiliateError("invalid_challenge", "Request a new enrollment challenge.");
  return result.rows[0];
}
export async function createChallenge(record: ChallengeRecord): Promise<void> {
  await database().query(`INSERT INTO manekineko_affiliate_challenges(id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,expires_at,contract_version,affiliate_id,commission_bps,eligibility_source_address,eligibility_token_id)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [record.id,record.collectionId,record.wallet,record.chainId,record.contractAddress,record.origin,record.nonce,record.ipDigest,record.expiresAt,record.contractVersion,record.affiliateId,record.commissionBps,record.eligibilitySourceAddress,record.eligibilityTokenId]);
}
export async function consumeChallenge(record: ChallengeRecord): Promise<void> {
  const result = await database().query(AFFILIATE_CONSUME_SQL, [record.id,record.collectionId,record.wallet]);
  if (result.rowCount !== 1) throw new AffiliateError("challenge_consumed", "This challenge expired or was already used. Request a new one.", 409);
}
