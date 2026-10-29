export const WALLET_PAGE_SIZE=24;
export type WalletNft={tokenId:number;collectionId:number;serial:number;name:string;collectionName:string;image:string|null;numbers:number[]};
export type WalletPayment={transaction:string;logIndex:number;block:number;collectionId:number;collectionName:string;tokenId:number;kind:number;amountWei:string};
export type WalletProfile={status:'ready'|'syncing'|'unavailable';wallet:string;chainId:number;contract:string;block:number|null;syncedAt:string|null;catchingUp:boolean;stale:boolean;totals:{kind:number;count:number;amountWei:string}[];owned:number;nftPage:number;activityPage:number;paymentsTotal:number;nfts:WalletNft[];payments:WalletPayment[]};
export const paymentNames=['Prize','Refund','Affiliate reward','Holder reward','Treasury payout','Execution reward','Operating funds'];
export function walletPageNumber(value:string|null){if(value===null)return 1;if(!/^[1-9]\d{0,3}$/.test(value))throw new Error('Invalid page.');return Number(value);}
