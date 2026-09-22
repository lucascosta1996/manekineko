import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Contract, JsonRpcProvider, keccak256, getAddress } from 'ethers';
import { buildLegacyCreditChain } from '../packages/contracts/src/winner-credits.ts';
import { matchesRuntime } from '../apps/contracts/scripts/runtime-match.ts';
const root = new URL('../', import.meta.url);
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const lower = address => getAddress(address).toLowerCase();

/** Only the canonical PrizeDelivered holder establishes eligibility; current ownership is never used. */
export async function verifyLegacyWinner(provider, source, artifacts, blockTag) {
  const [roundCode, factoryCode] = await Promise.all([provider.getCode(source.sourceRound, blockTag), provider.getCode(source.factory, blockTag)]);
  ensure(matchesRuntime(roundCode, artifacts.round) && matchesRuntime(factoryCode, artifacts.factory)
    && keccak256(factoryCode).toLowerCase() === source.factoryCodeHash.toLowerCase(), 'Legacy bytecode or factory pin differs.');
  const round = new Contract(source.sourceRound, artifacts.round.abi, provider), factory = new Contract(source.factory, artifacts.factory.abi, provider);
  const at = {blockTag};
  const [mapped, version, id, paid, winnerId, recipient, amount, receipt] = await Promise.all([
    factory.rounds(source.roundId, at), round.CONTRACT_VERSION(at), round.roundId(at), round.prizePaid(at),
    round.winningTokenId(at), round.prizeRecipient(at), round.prizePaidAmount(at), provider.getTransactionReceipt(source.transactionHash),
  ]);
  ensure(lower(mapped) === lower(source.sourceRound) && version === 'affiliate-v5' && String(id) === source.roundId && paid, 'Legacy collection binding or settlement differs.');
  ensure(receipt?.status === 1 && receipt.blockNumber <= blockTag, 'Legacy settlement is missing or unconfirmed.');
  const block = await provider.getBlock(receipt.blockNumber);
  ensure(block?.hash === receipt.blockHash, 'Legacy settlement is not canonical.');
  const events = receipt.logs.filter(log => lower(log.address) === lower(source.sourceRound)).flatMap(log => {
    try { const event = round.interface.parseLog(log); return event?.name === 'PrizeDelivered' ? [event.args] : []; } catch { return []; }
  });
  ensure(events.length === 1, 'Expected exactly one PrizeDelivered event from the legacy collection.');
  const event = events[0];
  ensure(event.tokenId === winnerId && lower(event.recipient) === lower(recipient) && event.amount === amount, 'Legacy payout event does not match on-chain settlement.');
  return { win: {sourceRound: lower(source.sourceRound), holder: lower(event.holder), tokenId: String(event.tokenId), paidAt: String(block.timestamp), transactionHash: receipt.hash.toLowerCase()}, evidence: {blockNumber:block.number, blockHash:block.hash, amountWei:String(amount), recipient:lower(recipient)} };
}
async function main() {
  const args = process.argv.slice(2);
  ensure(args.length === 4 && args[0] === '--input' && args[2] === '--output', 'Use --input reviewed-sources.json --output new-manifest.json.');
  const input = JSON.parse(await readFile(args[1], 'utf8'));
  ensure(input.schemaVersion === 1 && [1,11155111].includes(input.chainId) && Array.isArray(input.sources) && input.sources.length > 0 && input.sources.length <= 1000, 'Invalid legacy source list.');
  const rpc = process.env[input.chainId === 1 ? 'MAINNET_RPC_URL' : 'SEPOLIA_RPC_URL'];
  ensure(typeof rpc === 'string' && rpc.startsWith('https://'), 'Configure the matching HTTPS RPC.');
  const provider = new JsonRpcProvider(rpc, input.chainId, {staticNetwork:true});
  try {
    ensure(BigInt(await provider.send('eth_chainId',[])) === BigInt(input.chainId), 'Wrong RPC chain.');
    const head = await provider.getBlock('latest');
    ensure(head?.hash && Date.now()/1000-head.timestamp<300, 'RPC head is stale.');
    const snapshot = await provider.getBlock(head.number-64);
    ensure(snapshot?.hash, 'Cannot pin a confirmed snapshot.');
    const artifacts = {};
    for (const [key,name] of [['round','ManekinekoRoundV5'],['factory','ManekinekoFactoryV5']]) artifacts[key] = JSON.parse(await readFile(new URL(`apps/contracts/artifacts/contracts/${name}.sol/${name}.json`,root),'utf8'));
    const records = [];
    for (const source of input.sources) records.push(await verifyLegacyWinner(provider,source,artifacts,snapshot.number));
    ensure((await provider.getBlock(snapshot.number))?.hash === snapshot.hash, 'Snapshot reorganized; repeat verification.');
    const chain = buildLegacyCreditChain(input.chainId, records.map(record=>record.win));
    const manifest = {schemaVersion:1,chains:[chain]};
    await writeFile(args[3],JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({chainId:input.chainId,root:chain.root,winners:records.length,verifiedBlock:snapshot.number,evidence:records.map(record=>record.evidence),output:args[3]}));
  } finally { provider.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('Legacy winner verification stopped. No transactions sent; provider diagnostics withheld.');process.exitCode=1;});
