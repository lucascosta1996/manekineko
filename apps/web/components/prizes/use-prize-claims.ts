"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TransactionReceipt } from "ethers";
import { checkTransaction, readTransaction, recoverTransaction, submitTransaction, walletError, type ContractTarget, type TransactionJournal, type WalletSession } from "../../lib/affiliates/wallet";
import { prepareLegacyPrizeClaim, prepareRankedPrizeClaim } from "../../lib/prizes/wallet";
import { prizeJournalRank, prizeOperationKey } from "../../lib/prizes/operation";
import { readConfirmedPrizes, rememberConfirmedPrize } from "../../lib/prizes/confirmed";

export type ClaimPrize = { collectionId: string; rank: number; tokenId: number; amountWei: string };
export type PrizeOperation = { key: string; message: string; phase: "checking" | "wallet" | "pending" | "confirmed" | "error"; journal: TransactionJournal | null; hash: string | null };

export function usePrizeClaims(onConfirmed?: () => void) {
  const router = useRouter();
  const [operation, setOperation] = useState<PrizeOperation | null>(null);
  const [paid, setPaid] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  function restore(collectionId: string, target: ContractTarget, observedBlock?: string) {
    const confirmed = readConfirmedPrizes(collectionId, observedBlock);
    setPaid(current => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${collectionId}:`)));
      for (const receipt of confirmed) next[prizeOperationKey(collectionId, receipt.rank)] = receipt.hash;
      return next;
    });
    const journal = readTransaction(target, "prize");
    if (journal) setOperation({ key: prizeOperationKey(collectionId, prizeJournalRank(journal)), phase: "pending", journal, hash: journal.hash, message: "A previous claim needs confirmation. Connect its original account and check the receipt before sending another claim." });
  }
  async function claim(prize: ClaimPrize, session: WalletSession, getTarget: () => Promise<ContractTarget>, recoveryHash = "") {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    const key = prizeOperationKey(prize.collectionId, prize.rank);
    const update = (fields: Partial<PrizeOperation>) => setOperation(current => ({ key, message: "", phase: "checking", journal: null, hash: null, ...(current?.key === key ? current : {}), ...fields }));
    update({ phase: "checking", message: `Checking ticket #${prize.tokenId}, its current holder and unpaid amount…` });
    let target: ContractTarget | undefined;
    try {
      target = await getTarget();
      if (session.chainId !== target.chainId) throw new Error(`Wrong network. Connect your selected account on ${target.chainId === 1 ? "Ethereum Mainnet" : "Sepolia testnet"} before claiming.`);
      const previous = readTransaction(target, "prize");
      let confirmedHash: string;
      let receipt: TransactionReceipt | null = null;
      const received = (next: TransactionReceipt) => { receipt = next; };
      if (previous) {
        const rank = prizeJournalRank(previous);
        if (rank !== prize.rank) throw new Error(`Prize #${rank} has an unresolved transaction. Check that prize's receipt with ${previous.wallet} before sending another claim.`);
        update({ journal: previous, hash: previous.hash, phase: "pending" });
        let recovered = previous;
        const status = recoveryHash.trim()
          ? await recoverTransaction(session, target, previous, recoveryHash.trim(), record => { recovered = record; update({ journal: record, hash: record.hash }); }, received)
          : await checkTransaction(session, target, previous, received);
        if (status !== "confirmed") {
          update({ phase: status === "reverted" ? "error" : "pending", journal: status === "reverted" ? null : recovered, message: status === "reverted" ? "The transaction reverted. No prize was paid. Review the wallet before trying again." : status === "pending" ? "The original claim is still pending. Another claim will not be submitted." : "The wallet did not return a transaction hash. Paste the hash from its activity to verify the original claim; nothing will be resubmitted automatically." });
          return;
        }
        confirmedHash = recovered.hash!;
      } else {
        const ranked = ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(target.contractVersion ?? "");
        const request = await (ranked ? prepareRankedPrizeClaim : prepareLegacyPrizeClaim)(session, target, prize);
        receipt = await submitTransaction(session, target, "prize", request, journal => update({ journal, hash: journal.hash, phase: journal.hash ? "pending" : "wallet", message: journal.hash ? "Claim submitted. Waiting for its receipt…" : "Confirm in your wallet. Open your wallet app or extension to review this claim." }));
        confirmedHash = receipt.hash;
      }
      if (!receipt || receipt.status !== 1) throw new Error("The confirmed receipt is unavailable. Refresh the prize state before continuing.");
      try { rememberConfirmedPrize({ collectionId: prize.collectionId, rank: prize.rank, hash: confirmedHash, blockHash: receipt.blockHash, blockNumber: String(receipt.blockNumber) }); } catch { /* Payment is already confirmed; preserve its visible receipt even if storage is now unavailable. */ }
      setPaid(current => ({ ...current, [key]: confirmedHash }));
      update({ phase: "confirmed", journal: null, hash: confirmedHash, message: `Ticket #${prize.tokenId}: prize payment confirmed. Collection totals and payment history may take time to index.` });
      window.dispatchEvent(new CustomEvent("tincta:prize-confirmed", { detail: { collectionId: prize.collectionId, rank: prize.rank, hash: confirmedHash, blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash } }));
      onConfirmed?.(); router.refresh();
    } catch (error) {
      let journal: TransactionJournal | null = null;
      let savedRank = prize.rank;
      try { if (target) { journal = readTransaction(target, "prize"); if (journal) savedRank = prizeJournalRank(journal); } } catch { journal = null; }
      if (journal && savedRank !== prize.rank) setOperation({ key: prizeOperationKey(prize.collectionId, savedRank), phase: "pending", message: walletError(error), journal, hash: journal.hash });
      else update({ phase: "error", message: walletError(error), journal });
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  return { operation, paid, busy, claim, restore };
}
