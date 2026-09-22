import catalog from "./catalog.json";
import { SCORE_FORMULA, type CollectionPublic } from "./model";
import { validateCollection } from "./validation";

/** Checked-in backend records. There is deliberately no pretend on-chain mint activity. */
export function seededCollections(): CollectionPublic[] {
  return catalog.collections.map((record) =>
    validateCollection({
      ...record,
      ...catalog.network,
      algorithmVersion: "feistel-v1",
      contractVersion: "legacy",
      randomnessProvider: "future-blockhash",
      randomnessRequestId: null,
      randomnessState: null,
      seriesId: catalog.series.id,
      contractStatus: "undeployed",
      contractAddress: null,
      mode: "demo",
      source: "seed",
      mintDeadline: null,
      maxMintBatch: 20,
      prizeBps: 5000,
      scoreFormula: SCORE_FORMULA,
      totalMinted: 0,
      totalMintRevenueWei: "0",
      phase: null,
      prizePaid: false,
    })
  );
}
