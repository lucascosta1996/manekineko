"use client";
import { prepareRankedPrizeClaim } from "../../lib/prizes/wallet";
import Link from "next/link";
import { useState } from "react";
import type { CollectionPublic } from "../../lib/collections/model";
import type { AffiliateProgram } from "../../lib/affiliates/types";
import { connectWallet, readTransaction, checkTransaction, recoverTransaction, submitTransaction, walletError, type ContractTarget, type TransactionJournal } from "../../lib/affiliates/wallet";
import { formatWei } from "../../lib/mint/format";

/** Claims are always signed by the actual on-chain holder; the server has no payout signer. */
export function RankedAwards({ collection, claim = false }: { collection: CollectionPublic; claim?: boolean }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [recoveryHash, setRecoveryHash] = useState("");
  if (!["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(collection.contractVersion) || !collection.awards?.length) return null;
  async function withdraw(rank: number) {
    if (busy) return;
    setBusy(true); setMessage("");
    let session;
    try {
      const response = await fetch(`/api/collections/${collection.id}/affiliates`, { cache:"no-store" });
      if (!response.ok) throw new Error("The collection deployment could not be verified. Try again shortly.");
      const { program } = await response.json() as { program: AffiliateProgram };
      if (program.contractVersion!==collection.contractVersion || program.chainId!==collection.chainId || !program.contractAddress || program.contractAddress.toLowerCase()!==collection.contractAddress?.toLowerCase() || !program.runtimeCodeHash) throw new Error("Collection verification failed.");
      const target: ContractTarget = {chainId:program.chainId,contractAddress:program.contractAddress,contractVersion:program.contractVersion,runtimeCodeHash:program.runtimeCodeHash,
        mintPriceWei:program.mintPriceWei,maxSupply:program.maxSupply,maxAffiliateSlots:program.maxSlots,prizeBps:program.prizeBps,winnerCount:program.winnerCount,secondPrizeBps:program.secondPrizeBps,
        minAffiliateReferrals:program.minAffiliateReferrals,affiliatePayoutCapBps:program.affiliatePayoutCapBps,affiliatePoolBps:program.affiliatePoolBps,affiliateRatesBps:[]};
      session = await connectWallet(collection.chainId);
      const previous = readTransaction(target,"prize");
      if (previous) {
        setJournal(previous);
        const status = recoveryHash.trim()
          ? await recoverTransaction(session,target,previous,recoveryHash.trim(),setJournal)
          : await checkTransaction(session,target,previous);
        if (status === "confirmed" || status === "reverted") { setJournal(null); setRecoveryHash(""); }
        setMessage(status === "confirmed" ? "Your prize transaction is confirmed. The collection will update after indexing."
          : status === "reverted" ? "The previous prize transaction reverted. No prize was paid by that transaction."
          : status === "pending" ? "Your prize transaction is still pending. Another claim will not be submitted."
          : "The wallet did not return a transaction hash. Paste it from your wallet activity below to verify the original claim before retrying.");
        return;
      }
      const award = collection.awards!.find(a=>a.rank===rank);
      if (!award) throw new Error("The prize is unavailable. Refresh the collection.");
      const request = await prepareRankedPrizeClaim(session,target,award);
      await submitTransaction(session,target,"prize",request,setJournal);
      setJournal(null); setMessage("Prize claimed. The confirmed collection data will update after indexing.");
    } catch (error) { setMessage(walletError(error)); }
    finally { session?.provider.destroy(); setBusy(false); }
  }
  return <section className="ranked-awards" aria-label="Ranked collection prizes">
    <h3>Winning tickets</h3><p>The draw is finalized. Each prize is reserved independently until its winning NFT holder claims it. Multiple winning tickets may belong to the same wallet.</p>
    <div className="ranked-awards-grid">{collection.awards.map(award=><div key={award.rank}>
      <strong>Prize #{award.rank} · {formatWei(award.amountWei)} ETH</strong>
      <p><Link href={`/nfts/${collection.id}/${award.tokenId}`}>Ticket #{award.tokenId}</Link> · Score {award.score}</p>
      <p>{award.numbers.join(" / ")} · {award.claimed?"Paid":"Available to its holder"}</p>
      {award.claimTransaction && <a href={`${collection.explorerUrl}/tx/${award.claimTransaction}`} target="_blank" rel="noreferrer">View prize payment ↗</a>}
      {claim && !award.claimed && <button type="button" className="primary-button" disabled={busy} onClick={()=>void withdraw(award.rank)}>{busy?"Checking wallet…":`Claim prize #${award.rank}`}</button>}
    </div>)}</div>
    {message && <p role="status">{message}</p>}
    {journal && <div className="mint-recovery">
      {journal.hash && <p>Pending transaction: <a href={`${collection.explorerUrl}/tx/${journal.hash}`} target="_blank" rel="noreferrer">{journal.hash}</a>.</p>}
      <label htmlFor={`prize-recovery-${collection.id}`}>Transaction hash from your wallet</label>
      <input id={`prize-recovery-${collection.id}`} value={recoveryHash} onChange={event=>setRecoveryHash(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={busy} />
      <p>The wallet, collection, prize rank, recipient and nonce must match the original claim. Use the claim button again to check its receipt before any new submission.</p>
    </div>}
  </section>;
}
