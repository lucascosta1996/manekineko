export type MintActivity = {
  chainId: 1 | 11155111;
  collection: string;
  collectionId?:number;
  name: string;
  kind: 'genesis' | 'paid';
  tokenId: number;
  transaction: string;
};

/** Only public, bounded fields cross the website boundary. Links are derived locally. */
export function parseMintActivity(value: unknown): MintActivity[] {
  const events = (value as { events?: unknown } | null)?.events;
  if (!Array.isArray(events) || events.length > 40) throw new Error('Invalid mint activity.');
  return events.map(event => {
    if (!event || ![1, 11155111].includes(event.chainId)
      || typeof event.collection !== 'string' || !/^0x[0-9a-f]{40}$/i.test(event.collection)
      || typeof event.transaction !== 'string' || !/^0x[0-9a-f]{64}$/i.test(event.transaction)
      || typeof event.name !== 'string' || !event.name.trim() || event.name.length > 160 || /[\u0000-\u001f\u007f]/.test(event.name)
      || !['genesis', 'paid'].includes(event.kind) || !Number.isSafeInteger(event.tokenId) || event.tokenId < 1 || event.tokenId > 65536) {
      throw new Error('Invalid mint activity.');
    }
    if(event.collectionId!==undefined&&event.collectionId!==null&&(!Number.isInteger(event.collectionId)||event.collectionId<0||event.collectionId>256||event.chainId!==11155111||(event.kind==='genesis')!==(event.collectionId===0)))throw new Error('Invalid mint activity.');
    return { ...(event.collectionId===undefined||event.collectionId===null?{}:{collectionId:event.collectionId}), chainId: event.chainId, collection: event.collection.toLowerCase(), name: event.name.trim(), kind: event.kind,
      tokenId: event.tokenId, transaction: event.transaction.toLowerCase() };
  });
}

// One notification per mint transaction in each collection, including batch mints.
export const mintActivityId = (event: MintActivity) => `${event.chainId}:${event.collection}:${event.collectionId??"legacy"}:${event.transaction}`;
export const mintTransactionUrl = (event: MintActivity) => `https://${event.chainId === 1 ? '' : 'sepolia.'}etherscan.io/tx/${event.transaction}`;
