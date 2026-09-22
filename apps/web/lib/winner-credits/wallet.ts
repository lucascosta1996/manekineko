"use client";

import { Contract, keccak256, ZeroAddress } from "ethers";
import { assertWallet, type ContractTarget, type WalletSession } from "../affiliates/wallet.ts";
import { WINNER_CREDIT_ABI } from "./abi.ts";
import { creditAwardRank, winnerCreditKey, registrySupportsCredit } from "./model.ts";
import type { WinnerCredit, WinnerCreditResponse } from "./model.ts";

/** A source selects exactly one reward. No caller-supplied recipient or ETH payment. */
export async function prepareCreditRedemption(session: WalletSession, data: WinnerCreditResponse, credit: WinnerCredit) {
  await assertWallet(session);
  const network = data.networks.find((network) => network.chainId === session.chainId);
  const destination = data.target;
  if (data.wallet !== session.address.toLowerCase() || !destination?.ready || destination.chainId !== session.chainId || !credit.available || credit.used || credit.chainId !== session.chainId
    || credit.winningHolder.toLowerCase() !== session.address.toLowerCase() || !network?.configured || network.lifetimeRedemption || !network.registryAddress || !network.runtimeCodeHash
    || !data.credits.some((item) => winnerCreditKey(item) === winnerCreditKey(credit) && item.available)) throw new Error("Refresh the credit and collection before redeeming.");
  const code = await session.provider.getCode(network.registryAddress);
  if (code === "0x" || keccak256(code).toLowerCase() !== network.runtimeCodeHash.toLowerCase()) throw new Error("The winner credit registry could not be verified.");
  const registry = new Contract(network.registryAddress, WINNER_CREDIT_ABI, session.signer);
  const registryVersion = await registry.WINNER_CREDITS_VERSION();
  if (!registrySupportsCredit(credit.contractVersion, registryVersion) || (destination.contractVersion && !registrySupportsCredit(destination.contractVersion, registryVersion)) || (network.registryVersion && registryVersion !== network.registryVersion)) throw new Error("Unsupported winner credit registry.");
  const lifetimeUsed = registryVersion !== "winner-credits-v2" ? await registry.lifetimeRewardUsed(session.address) : String(await registry.redeemedSource(session.address)).toLowerCase() !== ZeroAddress;
  if (lifetimeUsed) throw new Error("This wallet has already used its lifetime sponsored ticket.");
  const ranked = ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(credit.contractVersion);
  const method = ranked ? credit.claimed ? "redeemAward" : "claimAndRedeemAward" : credit.claimed ? "redeem" : credit.legacy ? "redeemLegacy" : "claimAndRedeem";
  if (credit.legacy && !credit.claimed && (!credit.legacyWin || credit.legacyWin.holder.toLowerCase() !== session.address.toLowerCase() || credit.legacyWin.sourceRound.toLowerCase() !== credit.contractAddress.toLowerCase())) throw new Error("Historical winner proof is unavailable.");
  const args = ranked ? [credit.contractAddress, creditAwardRank(credit), destination.contractAddress] : credit.legacy && !credit.claimed ? [credit.legacyWin, credit.proof, destination.contractAddress] : [credit.contractAddress, destination.contractAddress];
  await registry[method].staticCall(...args);
  await assertWallet(session);
  return { target: { chainId: session.chainId, contractAddress: network.registryAddress, runtimeCodeHash: network.runtimeCodeHash } satisfies ContractTarget,
    request: await registry[method].populateTransaction(...args, { value: 0n }) };
}

/** Late registration admits a completed source only; it does not activate or fund a sale. */
export async function prepareCreditSourceRegistration(session: WalletSession, data: WinnerCreditResponse, credit: WinnerCredit) {
  await assertWallet(session);
  const network = data.networks.find((network) => network.chainId === session.chainId);
  if (!data.credits.some(item => winnerCreditKey(item) === winnerCreditKey(credit) && item.canRegisterSource) || data.wallet !== session.address.toLowerCase() || credit.chainId !== session.chainId || credit.winningHolder.toLowerCase() !== session.address.toLowerCase()
    || !["affiliate-v6", "affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(credit.contractVersion) || !credit.canRegisterSource || credit.used || credit.claimed
    || !network?.configured || network.lifetimeRedemption || !network.registryAddress || !network.runtimeCodeHash) throw new Error("This credit source cannot be registered from this wallet.");
  const code = await session.provider.getCode(network.registryAddress);
  if (code === "0x" || keccak256(code).toLowerCase() !== network.runtimeCodeHash.toLowerCase()) throw new Error("The winner credit registry could not be verified.");
  const registry = new Contract(network.registryAddress, WINNER_CREDIT_ABI, session.signer);
  const registryVersion = await registry.WINNER_CREDITS_VERSION();
  if (!registrySupportsCredit(credit.contractVersion, registryVersion) || (network.registryVersion && registryVersion !== network.registryVersion)) throw new Error("Unsupported winner credit registry.");
  const lifetimeUsed = registryVersion !== "winner-credits-v2" ? await registry.lifetimeRewardUsed(session.address) : String(await registry.redeemedSource(session.address)).toLowerCase() !== ZeroAddress;
  if (lifetimeUsed) throw new Error("This wallet has already used its lifetime sponsored ticket.");
  await registry.registerCollection.staticCall(credit.factoryAddress, credit.roundId);
  await assertWallet(session);
  return { target: { chainId: session.chainId, contractAddress: network.registryAddress, runtimeCodeHash: network.runtimeCodeHash } satisfies ContractTarget,
    request: await registry.registerCollection.populateTransaction(credit.factoryAddress, credit.roundId, { value: 0n }) };
}
