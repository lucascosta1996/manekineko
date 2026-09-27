import test from "node:test";
import assert from "node:assert/strict";
import { Wallet, Interface } from "ethers";
import { assertRecoveredPrizeRecipients } from "./settle-airy-prizes.ts";
import { AIRY_RECOVERY as A } from "./airy-recovery-plan.ts";
import type { SeasonState } from "./runner.ts";
import type { ChainSnapshot } from "./chain.ts";

test("previous prize payments must have a signed journal intent paying this deployer", async () => {
  const holder = Wallet.createRandom(), owner = Wallet.createRandom().address;
  const snapshot = { awards: [{ rank: 1, claimed: true, paidHolder: holder.address }] } as ChainSnapshot;
  const iface = new Interface(["function claimPrizeForRank(uint256,address)"]);
  for (const recipient of [owner, holder.address]) {
    const rawTransaction = await holder.signTransaction({ chainId: 11155111, type: 2, nonce: 0, maxFeePerGas: 100, maxPriorityFeePerGas: 1, gasLimit: 100000, to: A.round, data: iface.encodeFunctionData("claimPrizeForRank", [1, recipient]) });
    const state = { rehearsal: { journals: { [holder.address]: { from: holder.address, transactions: [{ action: `claim:${A.round.toLowerCase()}:1`, rawTransaction }] } } } } as unknown as SeasonState;
    if (recipient === owner) assert.doesNotThrow(() => assertRecoveredPrizeRecipients(snapshot, state, owner));
    else assert.throws(() => assertRecoveredPrizeRecipients(snapshot, state, owner), /not_recovered_to_deployer/);
  }
  assert.throws(() => assertRecoveredPrizeRecipients(snapshot, {}, owner), /payment_evidence/);
});
