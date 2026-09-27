export interface ConfirmedPrizeReceipt { collectionId: string; rank: number; hash: string; blockNumber: string; blockHash: string }
const key = (collectionId: string) => `tincta:confirmed-prizes:${collectionId}`;

/** A local receipt bridges indexing lag; a newer canonical observation always wins. */
export function readConfirmedPrizes(collectionId: string, observedBlock?: string): ConfirmedPrizeReceipt[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key(collectionId)) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item): item is ConfirmedPrizeReceipt => item && item.collectionId === collectionId && Number.isInteger(item.rank) && item.rank >= 1 && item.rank <= 10 && /^0x[0-9a-f]{64}$/i.test(item.hash) && /^0x[0-9a-f]{64}$/i.test(item.blockHash) && /^[1-9][0-9]*$/.test(item.blockNumber)
      && (observedBlock === undefined || BigInt(item.blockNumber) > BigInt(observedBlock)));
  } catch { return []; }
}

export function rememberConfirmedPrize(receipt: ConfirmedPrizeReceipt): void {
  const current = readConfirmedPrizes(receipt.collectionId).filter(item => item.rank !== receipt.rank);
  sessionStorage.setItem(key(receipt.collectionId), JSON.stringify([...current, receipt]));
}
