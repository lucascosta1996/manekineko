"use client";

import { Contract, keccak256, ZeroAddress } from "ethers";
import { assertWallet, type ContractTarget, type WalletSession } from "./wallet.ts";
import type { AffiliateEnrollmentEligibility, AffiliateNftSelection } from "./types.ts";
import { AFFILIATE_ELIGIBILITY_ABI, eligibilityReason } from "./eligibility-abi.ts";

/** Recheck the actual NFT holder through the pinned gate before either wallet signature or enrollment. */
export async function verifyEnrollmentNft(session: WalletSession, target: ContractTarget, eligibility: AffiliateEnrollmentEligibility | undefined, selection: AffiliateNftSelection) {
  await assertWallet(session);
  if ((target.contractVersion !== "affiliate-v6" && target.contractVersion !== "affiliate-v7" && (target.contractVersion !== "affiliate-v8" && target.contractVersion !== "affiliate-v9" && target.contractVersion !== "affiliate-v10")) || session.chainId !== target.chainId || !eligibility || !/^0x[0-9a-f]{40}$/i.test(eligibility.gateAddress) || eligibility.gateAddress.toLowerCase() === ZeroAddress
    || !/^0x[0-9a-f]{64}$/i.test(eligibility.runtimeCodeHash) || !/^0x[0-9a-f]{40}$/i.test(selection.sourceCollection) || !/^(0|[1-9][0-9]{0,4})$/.test(selection.sourceTokenId) || BigInt(selection.sourceTokenId)>65536n
    || ((selection.sourceCollection.toLowerCase()===ZeroAddress)!==(selection.sourceTokenId==="0"))) throw new Error("Review the qualifying NFT and collection before enrolling.");
  const code=await session.provider.getCode(eligibility.gateAddress);
  if (code==="0x" || keccak256(code).toLowerCase()!==eligibility.runtimeCodeHash.toLowerCase()) throw new Error("The NFT eligibility verifier could not be verified.");
  const round = new Contract(target.contractAddress,["function affiliateEligibility() view returns(address)"],session.signer);
  const gate = new Contract(eligibility.gateAddress,AFFILIATE_ELIGIBILITY_ABI,session.signer);
  const [roundGate,version,info]=await Promise.all([round.affiliateEligibility(),gate.ELIGIBILITY_VERSION(),gate.collections(target.contractAddress)]);
  if (String(roundGate).toLowerCase()!==eligibility.gateAddress.toLowerCase() || version!==(target.contractVersion === "affiliate-v10" ? "affiliate-eligibility-v5" : target.contractVersion === "affiliate-v9" ? "affiliate-eligibility-v4" : target.contractVersion === "affiliate-v8"?"affiliate-eligibility-v3":target.contractVersion==="affiliate-v7"?"affiliate-eligibility-v2":"affiliate-eligibility-v1") || info.sequence.toString()!==eligibility.sequence
    || info.sequence===0n || info.sourceOnly || (info.sequence===1n)!==(eligibility.policy==="bootstrap")) throw new Error("The collection’s NFT eligibility rule changed. Refresh before signing.");
  const status=Number(await gate.eligibilityStatus(target.contractAddress,session.address,selection.sourceCollection,selection.sourceTokenId));
  const reason=eligibilityReason(status);
  if(reason)throw new Error(reason);
  await assertWallet(session);
}
