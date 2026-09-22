import "server-only";
import { equalAffiliatePool } from "./equal-pool";
import { Interface, keccak256, Wallet } from "ethers";
import { AffiliateError, configuredOrigin, normalizedWallet } from "./policy";
import type { ProgramRecord } from "./repository";
import { chainEnabled } from "../chain-policy";
import { createReadRpc } from "./rpc-read-transport";

const ROUND = new Interface([
  "function winnerCount() view returns(uint256)", "function secondPrizeBps() view returns(uint256)", "function minAffiliateReferrals() view returns(uint256)", "function affiliatePayoutCapBps() view returns(uint256)", "function saleStartAt() view returns(uint256)",
  "function affiliateQualifiedCount() view returns(uint256)", "function affiliateEqualShare() view returns(uint256)", "function unallocatedAffiliatePool() view returns(uint256)",
  "function MAX_MINTS_PER_WALLET() view returns(uint256)",
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)",
  "function AFFILIATE_BPS() view returns(uint256)", "function PRIZE_BPS() view returns(uint256)",
  "function affiliatePoolBps() view returns(uint256)", "function affiliatePoolAmount() view returns(uint256)", "function totalReferredMints() view returns(uint256)", "function affiliateEstimatedShare(uint256) view returns(uint256)",
  "function prizeBps() view returns(uint256)", "function affiliateRateBps(uint256) view returns(uint256)",
  "function affiliateReferredMints(uint256) view returns(uint256)", "function nextAvailableAffiliateId() view returns(uint256)",
  "function maxAffiliateSlots() view returns(uint256)", "function enrollmentSigner() view returns(address)",
  "function affiliateCount() view returns(uint256)", "function affiliateWallet(uint256) view returns(address)",
  "function affiliateIdOf(address) view returns(uint256)", "function affiliateAccrued(uint256) view returns(uint256)",
  "function affiliateClaimed(uint256) view returns(uint256)", "function affiliateClaimable(uint256) view returns(uint256)",
  "function totalAffiliateAccrued() view returns(uint256)", "function totalAffiliateClaimed() view returns(uint256)",
  "function mintPrice() view returns(uint256)", "function maxSupply() view returns(uint256)", "function roundId() view returns(uint256)",
  "function mintDeadline() view returns(uint256)", "function totalMinted() view returns(uint256)",
  "function saleActivated() view returns(bool)", "function soldOut() view returns(bool)", "function refundsAvailable() view returns(bool)", "function prizePaid() view returns(bool)",
  "function renderer() view returns(address)", "function affiliateEligibility() view returns(address)",
]);
const FACTORY = new Interface(["function rounds(uint256) view returns(address)", "function renderer() view returns(address)"]);
const SIGNATURE = new Interface(["function isValidSignature(bytes32,bytes) view returns(bytes4)"]);
export interface ChainSnapshot {
  record: ProgramRecord; blockNumber: string; blockHash: string; blockTimestamp: number;
  codeHash: string; affiliateCount: number; saleActivated: boolean; soldOut: boolean; refundable: boolean; prizePaid: boolean;
  mintDeadline: bigint; totalMinted: number; totalAccrued: bigint; totalClaimed: bigint; enrollmentSigner: string;
  equalPool?: ReturnType<typeof equalAffiliatePool>;
  nextAvailableAffiliateId:number; totalReferredMints:number;
  call(name: string, args?: unknown[]): Promise<unknown>;
  readContract(address: string, iface: Interface, name: string, args?: unknown[]): Promise<readonly unknown[]>;
  verifyContractSignature(wallet: string, digest: string, signature: string): Promise<boolean>;
  walletCode(wallet: string): Promise<string>;
  assertCanonical(): Promise<void>;
}
export function enrollmentWallet(): Wallet {
  try { return new Wallet(process.env.AFFILIATE_ENROLLMENT_PRIVATE_KEY ?? ""); }
  catch { throw new AffiliateError("enrollment_unavailable", "Affiliate enrollment is not configured yet.", 503); }
}
export function enrollmentConfigured(signer: string): boolean {
  try {
    configuredOrigin();
    return enrollmentWallet().address.toLowerCase() === signer.toLowerCase() && !!process.env.TURNSTILE_SECRET_KEY
      && !/^[123]x0{10}/.test(process.env.TURNSTILE_SECRET_KEY ?? "")
      && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (process.env.AFFILIATE_IP_HASH_SECRET?.length ?? 0) >= 32
      && process.env.AFFILIATE_TRUSTED_PROXY === "vercel" && process.env.VERCEL === "1";
  } catch { return false; }
}
export async function trustedSnapshot(record: ProgramRecord): Promise<ChainSnapshot> {
  if (!chainEnabled(record.chainId)) throw new AffiliateError("network_disabled", "This collection is not available on this network.", 503);
  if (record.mode !== "live" || record.deploymentStatus !== "deployed" || !record.contractAddress || !record.factoryAddress || ![1,11155111].includes(record.chainId) || !["affiliate-v3","affiliate-v4","affiliate-v5","affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(record.contractVersion) || record.algorithmVersion !== (record.contractVersion === "affiliate-v10" ? "unique-rank-v6" : (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9") ? "unique-rank-v5" : record.contractVersion === "affiliate-v7" ? "unique-rank-v4" : record.contractVersion === "affiliate-v6" ? "unique-rank-v3" : "unique-rank-v2") || record.collectionContractVersion!==record.contractVersion) throw new AffiliateError("deployment_unavailable", "This collection has no verified live affiliate deployment.", 503);
  const v8 = (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10");
  const v7 = v8 || record.contractVersion === "affiliate-v7";
  const v6 = (record.contractVersion === "affiliate-v6" || record.contractVersion === "affiliate-v7" || (record.contractVersion === "affiliate-v8" || record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10"));
  const v5 = record.contractVersion === "affiliate-v5" || v6;
  const v4=record.contractVersion!=="affiliate-v3";
  const rpcUrl = process.env[`AFFILIATE_RPC_URL_${record.chainId}`];
  const factory = process.env[`AFFILIATE_TRUSTED_FACTORY_${record.contractVersion === "affiliate-v10" ? "V10_" : record.contractVersion === "affiliate-v9" ? "V9_" : v8?"V8_":v7?"V7_":v6?"V6_":v5?"V5_":v4?"V4_":""}${record.chainId}`]?.toLowerCase();
  const factoryHash = process.env[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${record.contractVersion === "affiliate-v10" ? "V10_" : record.contractVersion === "affiliate-v9" ? "V9_" : v8?"V8_":v7?"V7_":v6?"V6_":v5?"V5_":v4?"V4_":""}${record.chainId}`]?.toLowerCase();
  if (!rpcUrl || !factory || !/^0x[0-9a-f]{64}$/.test(factoryHash ?? "") || factory !== record.factoryAddress.toLowerCase()) throw new AffiliateError("deployment_unavailable", "The collection factory has not been approved for live transactions.", 503);
  try { if (new URL(rpcUrl).protocol !== "https:") throw new Error(); } catch { throw new AffiliateError("deployment_unavailable", "A secure Ethereum connection is not configured.", 503); }
  const readRpc = createReadRpc(rpcUrl);
  async function rpc(method: string, params: unknown[]): Promise<any> {
    try { return await readRpc(method, params); }
    catch { throw new AffiliateError("chain_unavailable", "Ethereum data is temporarily unavailable.", 503); }
  }
  if (BigInt(await rpc("eth_chainId", [])) !== BigInt(record.chainId)) throw new AffiliateError("chain_mismatch", "The Ethereum connection is on the wrong network.", 503);
  const block = await rpc("eth_getBlockByNumber", ["latest",false]);
  if (!/^0x[0-9a-f]{64}$/i.test(block.hash) || Math.abs(Date.now()/1000-Number(BigInt(block.timestamp))) > 180) throw new AffiliateError("stale_chain", "Ethereum data is stale. Please try again shortly.", 503);
  const blockTag = { blockHash: block.hash, requireCanonical: true };
  async function assertCanonical(): Promise<void> {
    if ((await rpc("eth_getBlockByNumber",[block.number,false])).hash !== block.hash) throw new AffiliateError("chain_reorganized","Ethereum changed while reading this collection. Please try again.",503);
  }
  async function readContract(address: string, iface: Interface, name: string, args: unknown[] = []) {
    const raw = await rpc("eth_call", [{to:address,data:iface.encodeFunctionData(name,args)},blockTag]);
    return iface.decodeFunctionResult(name,raw);
  }
  const callAt = async (address: string, iface: Interface, name: string, args: unknown[] = []) => (await readContract(address,iface,name,args))[0];
  const call = (name: string, args: unknown[] = []) => callAt(record.contractAddress!,ROUND,name,args);
  const [factoryCode, roundCode, registered, factoryRenderer] = await Promise.all([
    rpc("eth_getCode",[factory,blockTag]),rpc("eth_getCode",[record.contractAddress,blockTag]),
    callAt(factory,FACTORY,"rounds",[record.roundId]),callAt(factory,FACTORY,"renderer"),
  ]);
  if (factoryCode === "0x" || roundCode === "0x" || keccak256(factoryCode).toLowerCase() !== factoryHash || registered.toLowerCase() !== record.contractAddress) throw new AffiliateError("untrusted_deployment", "This collection deployment could not be verified.", 503);
  if ((record.contractVersion === "affiliate-v9" || record.contractVersion === "affiliate-v10") && await call("MAX_MINTS_PER_WALLET") !== 20n) throw new AffiliateError("terms_mismatch", "The wallet mint cap does not match this version.", 503);
  const names = [...(v7?[v8?"winnerCount":"secondPrizeBps","minAffiliateReferrals","affiliatePayoutCapBps","saleStartAt","affiliateQualifiedCount","affiliateEqualShare","unallocatedAffiliatePool"]:[]),"CONTRACT_VERSION","ALGORITHM_VERSION",...(v4?["prizeBps","nextAvailableAffiliateId"]:["AFFILIATE_BPS","PRIZE_BPS"]),...(v5?["affiliatePoolBps","totalReferredMints","affiliatePoolAmount"]:[]),"maxAffiliateSlots","enrollmentSigner","roundId","maxSupply","mintPrice","renderer","affiliateCount","saleActivated","soldOut","refundsAvailable","prizePaid","mintDeadline","totalMinted","totalAffiliateAccrued","totalAffiliateClaimed"];
  const values = await Promise.all(names.map(name=>call(name))); const value = Object.fromEntries(names.map((name,i)=>[name,values[i]]));
  const rates=v5?[]:v4?await Promise.all(record.affiliateRatesBps.map((_,index)=>call("affiliateRateBps",[index+1]))):record.affiliateRatesBps.map(()=>100n);
  const prizeBps=v4?value.prizeBps:value.PRIZE_BPS;
  if (value.CONTRACT_VERSION !== record.contractVersion || value.ALGORITHM_VERSION !== record.algorithmVersion || (!v4&&value.AFFILIATE_BPS!==100n) || prizeBps !== BigInt(record.prizeBps) || value.maxAffiliateSlots !== BigInt(record.maxSlots)
    || rates.some((rate,index)=>rate!==BigInt(record.affiliateRatesBps[index]))
    || value.enrollmentSigner.toLowerCase() !== record.enrollmentSigner || value.roundId !== BigInt(record.roundId) || value.maxSupply !== BigInt(record.maxSupply) || value.mintPrice !== BigInt(record.mintPriceWei)
    || value.renderer.toLowerCase() !== factoryRenderer.toLowerCase() || value.mintPrice % (v4?10000n:100n) !== 0n || value.affiliateCount > value.maxAffiliateSlots || value.totalAffiliateClaimed > value.totalAffiliateAccrued
    || (record.mintDeadline && value.mintDeadline !== BigInt(Math.floor(record.mintDeadline.getTime()/1000)))) throw new AffiliateError("terms_mismatch", "The collection terms do not match its verified deployment.", 503);
  if (v5 && (value.affiliatePoolBps !== BigInt(record.affiliatePoolBps!) || value.prizeBps + value.affiliatePoolBps > 10000n || value.totalReferredMints > value.totalMinted
    || value.affiliatePoolAmount !== BigInt(value.mintPrice) * BigInt(value.totalMinted) * BigInt(value.affiliatePoolBps) / 10000n
    || !v7 && value.totalAffiliateAccrued !== (value.soldOut && value.totalReferredMints > 0n ? value.affiliatePoolAmount : 0n))) throw new AffiliateError("terms_mismatch", "The pool accounting does not match the verified collection.", 503);
  let equalPool: ReturnType<typeof equalAffiliatePool> | undefined;
  if (v7) {
    if ((v8 ? value.winnerCount !== BigInt(record.winnerCount!) : value.secondPrizeBps !== BigInt(record.secondPrizeBps!)) || value.minAffiliateReferrals !== BigInt(record.minAffiliateReferrals!)
      || value.affiliatePayoutCapBps !== BigInt(record.affiliatePayoutCapBps!) || !record.saleStartAt
      || value.saleStartAt !== BigInt(Math.floor(record.saleStartAt.getTime()/1000))) throw new AffiliateError("terms_mismatch", "The ranked prize or qualification terms do not match this collection.",503);
    const referrals = await Promise.all(Array.from({length:record.maxSlots},(_,i)=>call("affiliateReferredMints",[i+1]).then(Number)));
    equalPool = equalAffiliatePool(referrals, record.minAffiliateReferrals!, record.mintPriceWei, Number(value.totalMinted), record.affiliatePoolBps!, record.affiliatePayoutCapBps!);
    if (referrals.reduce((a,b)=>a+b,0)!==Number(value.totalReferredMints) || value.totalAffiliateAccrued !== (value.soldOut ? BigInt(equalPool.distributedWei) : 0n)
      || value.soldOut && (Number(value.affiliateQualifiedCount)!==equalPool.qualifiedCount || value.affiliateEqualShare!==BigInt(equalPool.equalShareWei) || value.unallocatedAffiliatePool!==BigInt(equalPool.unallocatedWei))) throw new AffiliateError("terms_mismatch", "The equal affiliate payout could not be verified.",503);
  }
  const nextId=v4?Number(value.nextAvailableAffiliateId):Number(value.affiliateCount)<record.maxSlots?Number(value.affiliateCount)+1:0;
  if(nextId<0||nextId>record.maxSlots||(nextId!==0&&String(await call("affiliateWallet",[nextId])).toLowerCase()!=="0x0000000000000000000000000000000000000000")) throw new AffiliateError("offer_unavailable","The next affiliate position could not be verified.",503);
  return { record, equalPool, totalReferredMints:v5?Number(value.totalReferredMints):0, nextAvailableAffiliateId:nextId, blockNumber:BigInt(block.number).toString(),blockHash:block.hash,blockTimestamp:Number(BigInt(block.timestamp)),codeHash:keccak256(roundCode),affiliateCount:Number(value.affiliateCount),saleActivated:value.saleActivated,soldOut:value.soldOut,refundable:value.refundsAvailable,prizePaid:value.prizePaid,
    mintDeadline:value.mintDeadline,totalMinted:Number(value.totalMinted),totalAccrued:value.totalAffiliateAccrued,totalClaimed:value.totalAffiliateClaimed,enrollmentSigner:normalizedWallet(value.enrollmentSigner),call,
    assertCanonical, readContract, walletCode:wallet=>rpc("eth_getCode",[wallet,blockTag]),
    verifyContractSignature:async(wallet,digest,signature)=>{ try { return (await callAt(wallet,SIGNATURE,"isValidSignature",[digest,signature])).toLowerCase() === "0x1626ba7e"; } catch { return false; } },
  };
}
