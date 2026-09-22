export type DemoState = {
  version: 1;
  collectionId: string;
  minted: number;
  lastQuantity: number;
};

export function demoStorageKey(collectionId: string): string {
  return `manekineko:demo:v1:${collectionId}`;
}

export function readDemoState(
  raw: string | null,
  collectionId: string,
  maxSupply: number
): DemoState {
  const empty: DemoState = {
    version: 1,
    collectionId,
    minted: 0,
    lastQuantity: 0,
  };
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw) as Partial<DemoState>;
    if (
      value.version !== 1 ||
      value.collectionId !== collectionId ||
      !Number.isSafeInteger(value.minted) ||
      value.minted! < 0 ||
      value.minted! > maxSupply ||
      !Number.isSafeInteger(value.lastQuantity) ||
      value.lastQuantity! < 0 ||
      value.lastQuantity! > 20 ||
      value.lastQuantity! > value.minted!
    )
      return empty;
    return value as DemoState;
  } catch {
    return empty;
  }
}

/** Only local demonstration state. This never changes server or blockchain collection counters. */
export function mintDemoTickets(
  state: DemoState,
  quantity: number,
  maxSupply: number,
  maxBatch: number
): DemoState {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > Math.min(maxBatch, 20) ||
    state.minted + quantity > maxSupply
  )
    throw new Error("Choose an available ticket quantity.");
  return { ...state, minted: state.minted + quantity, lastQuantity: quantity };
}
