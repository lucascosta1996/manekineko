import { Interface, keccak256, ZeroAddress, ZeroHash } from "ethers";
import type { ChainSnapshot } from "./chain";
import type { AffiliateNftSelection } from "./types";
import { AffiliateError, enrollmentNftSelection } from "./policy.ts";
import { AFFILIATE_ELIGIBILITY_ABI, eligibilityReason } from "./eligibility-abi.ts";

const GATE = new Interface(AFFILIATE_ELIGIBILITY_ABI);
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
/** The database only suggests NFTs. The immutable gate, source order and current owner decide eligibility. */
export async function trustedAffiliateEligibility(snapshot: ChainSnapshot, env: Record<string,string|undefined> = process.env) {
  const { record } = snapshot;
  if ((record.contractVersion !== "affiliate-v6" && record.contractVersion !== "affiliate-v7" && (record.contractVersion !== "affiliate-v8" && record.contractVersion !== "affiliate-v9" && record.contractVersion !== "affiliate-v10")) || !record.contractAddress || !record.factoryAddress) throw new AffiliateError("eligibility_unavailable", "This deployment does not use holder eligibility.",503);
  const v8=(record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10"), v7=record.contractVersion==="affiliate-v7";
  const gateAddress = env[`AFFILIATE_ELIGIBILITY_${record.contractVersion==="affiliate-v10"?"V5_":record.contractVersion==="affiliate-v9"?"V4_":v8?"V3_":v7?"V2_":""}ADDRESS_${record.chainId}`]?.toLowerCase();
  const codeHash = env[`AFFILIATE_ELIGIBILITY_${record.contractVersion==="affiliate-v10"?"V5_":record.contractVersion==="affiliate-v9"?"V4_":v8?"V3_":v7?"V2_":""}CODEHASH_${record.chainId}`]?.toLowerCase();
  if (!gateAddress || !/^0x[0-9a-f]{40}$/.test(gateAddress) || gateAddress === ZeroAddress || !codeHash || !/^0x[0-9a-f]{64}$/.test(codeHash) || codeHash === ZeroHash) throw new AffiliateError("eligibility_unavailable", "The affiliate NFT eligibility rule is not configured for this deployment yet.",503);
  const call = (name: string, args: unknown[] = []) => snapshot.readContract(gateAddress,GATE,name,args);
  const [configuredGate, code, version, info, approvedHash] = await Promise.all([
    snapshot.call("affiliateEligibility"), snapshot.walletCode(gateAddress), call("ELIGIBILITY_VERSION"),
    call("collections",[record.contractAddress]), call("approvedFactoryCodeHash",[record.factoryAddress]),
  ]);
  if (!same(configuredGate,gateAddress) || code === "0x" || keccak256(code).toLowerCase() !== codeHash || version[0] !== (record.contractVersion==="affiliate-v10"?"affiliate-eligibility-v5":record.contractVersion==="affiliate-v9"?"affiliate-eligibility-v4":v8?"affiliate-eligibility-v3":v7?"affiliate-eligibility-v2":"affiliate-eligibility-v1")) throw new AffiliateError("eligibility_untrusted", "The collection’s NFT eligibility verifier could not be verified.",503);
  const sequence = BigInt(info[2] as bigint), sourceOnly = info[4] as boolean;
  if (sequence > 0n && (!same(info[0],record.factoryAddress) || info[1] !== BigInt(record.roundId) || !same(info[3],snapshot.codeHash)
    || !same(approvedHash[0],env[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${record.contractVersion==="affiliate-v10"?"V10":record.contractVersion==="affiliate-v9"?"V9":v8?"V8":v7?"V7":"V6"}_${record.chainId}`]))) throw new AffiliateError("eligibility_untrusted", "The collection’s canonical eligibility registration does not match this deployment.",503);
  const targetAddress = record.contractAddress;
  async function check(wallet: string, selection: AffiliateNftSelection): Promise<{eligible:boolean;reason:string|null}> {
    const normalized = enrollmentNftSelection(selection.sourceCollection,selection.sourceTokenId);
    const status = Number((await call("eligibilityStatus",[targetAddress,wallet,normalized.sourceCollection,normalized.sourceTokenId]))[0]);
    return { eligible: status === 0, reason: eligibilityReason(status) };
  }
  async function assertEligible(wallet: string, selection: AffiliateNftSelection): Promise<void> {
    const result = await check(wallet,selection);
    if (!result.eligible) throw new AffiliateError("nft_eligibility_required",result.reason ?? "A qualifying NFT is required to enroll.",409);
  }
  return { gateAddress, runtimeCodeHash:codeHash, sequence:sequence.toString(), policy:sequence === 1n ? "bootstrap" as const : "nft_holder" as const,
    reason:sequence === 0n || sourceOnly ? eligibilityReason(1) : null, check, assertEligible };
}
