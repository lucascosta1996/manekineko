/** One reviewed Sepolia genesis graph. No preparation, minting, legacy mutation or Mainnet capability. */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { publishSources } from './source-publication.mts';
import { explorerTransport } from './explorer-fetch.mts';
import { Contract, ContractFactory, FetchRequest, JsonRpcProvider, Wallet, ZeroAddress, ZeroHash, keccak256, toUtf8Bytes } from 'ethers';
import { compiled, verifyVrfSettings } from './verify-deployment.mts';
import { validateOptions } from '../protocol-v12/prepare.mjs';
import { createTransactionPipeline, ChainPendingError } from '../season-runner/chain-transactions.ts';
import { durable, exclusive, privateRead } from '../protocol-v12/rehearsal/store.mts';
const directory = process.env.V14_DEPLOY_DIRECTORY;
assert.ok(directory?.startsWith('/'), 'Set an absolute private V14_DEPLOY_DIRECTORY.');
await mkdir(directory, {recursive:true,mode:0o700});
const operator = '0x3b2571129c05bD71B6504596aB2ca52B3ffB7223';
const settings = {
  coordinator: '0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B',
  keyHash: '0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',
  confirmations: 64, callbackGas: 200000, votingDuration: 3600, votingDelay: 60,
  randomnessBudget: '10000000000000000', sponsorshipBudget: '40000000000000000', bootstrapAllowed: true,
};
// The exact two reviewed V14 economic choices, under normal production timing bounds.
const options = [
  { supply: '1000', price: '10000000000000000', winners: '6', duration: '3600' },
  { supply: '2000', price: '20000000000000000', winners: '4', duration: '86400' },
];
validateOptions(options); verifyVrfSettings(11155111, settings);
const source = JSON.parse(await readFile('apps/launch/catalog/sepolia.json', 'utf8'));
assert.equal(source.chainId, 11155111);
const catalog = source.seasons.flatMap((s: any) => s.collections.map((c: any) => ({ seasonId: s.seasonId, seasonName: s.name, ...c })));
assert.equal(source.seasons.length, 22); assert.equal(catalog.length, 216);
const names = ['ManekinekoWinnerCreditsV9', 'ManekinekoSeasonControllerV14', 'ManekinekoHolderRewardsV13', 'ManekinekoRoundDeployerV13', 'ManekinekoGenesisV14'];
const artifacts = Object.fromEntries(await Promise.all(names.map(async name => [name, await compiled(name)])));
const manifest = { chainId: 11155111, operator, scope: 'Independent Sepolia V14 Genesis; historical registries unchanged; no collections prepared.', settings, options, catalog,
  buildHashes: Object.fromEntries(names.map(n => [n, keccak256(artifacts[n].bytecode)])), maxFeePerGasWei: '5000000000', maxTotalSpendWei: '20000000000000000' };
const manifestHash = keccak256(toUtf8Bytes(JSON.stringify(manifest)));
let previousManifest: any;
try { previousManifest = JSON.parse(await privateRead(directory + '/manifest.json')); } catch(e: any) { if(e.code !== 'ENOENT') throw e; }
if(previousManifest) assert.deepEqual(previousManifest, manifest); else await durable(directory + '/manifest.json', manifest);
console.log(JSON.stringify({stage:'manifest', manifestHash, collections:catalog.length, operator, maxSpendEth:'0.02'}));
if(process.argv.includes('--manifest-only')) process.exit(0);
assert.ok(process.argv.includes('--execute'), 'Explicit --execute is required.');
const urls = [process.env.V14_VERIFY_RPC_URL!, process.env.V14_VERIFY_SECONDARY_RPC_URL!];
assert.ok(urls.every(url=>url && new URL(url).protocol === 'https:'));
assert.ok(process.env.ETHERSCAN_API_KEY, 'Explorer key required before deployment.');
const transport = explorerTransport();
assert.notEqual(new URL(urls[0]).hostname, new URL(urls[1]).hostname);
const providers = urls.map(url => { const request = new FetchRequest(url); request.timeout = 15000; return new JsonRpcProvider(request, 11155111, {staticNetwork:true}); });
const release = await exclusive(directory + '/signer.lock');
try {
  for(const p of providers) { assert.equal(await p.send('eth_chainId', []), '0xaa36a7'); const head = await p.getBlock('latest'); assert.ok(head && Math.abs(Date.now()/1000-head.timestamp)<180); assert.notEqual(await p.getCode(settings.coordinator), '0x'); }
  const provider = providers[0], signer = new Wallet(process.env.V14_DEPLOYER_PRIVATE_KEY!, provider);
  assert.equal(signer.address, operator);
  let state: any;
  try { state = JSON.parse(await privateRead(directory + '/journal.json')); } catch(e: any) { if(e.code !== 'ENOENT') throw e; }
  state ??= { manifestHash, contracts: {}, journal: { version:1, chainId:11155111, from:operator, maxFeePerGasWei:manifest.maxFeePerGasWei, maxTotalSpendWei:manifest.maxTotalSpendWei, transactions:[], collections:{} } };
  assert.equal(state.manifestHash, manifestHash);
  const save = () => durable(directory + '/journal.json', state);
  await save();
  const pipeline = createTransactionPipeline({provider, signer, execute:true, journal:state.journal, save, confirmations:2});
  async function send(action: string, request: any) {
    for(;;) {
      try { const receipt = await pipeline.send(action, request); console.log(JSON.stringify({stage:'confirmed', action, hash:receipt.hash, block:receipt.blockNumber})); return receipt; }
      catch(e) { if(!(e instanceof ChainPendingError)) throw e; await new Promise(r=>setTimeout(r,4000)); }
    }
  }
  async function deploy(name: string, args: any[]) {
    const factory = new ContractFactory(artifacts[name].abi, artifacts[name].bytecode, signer);
    const receipt = await send('deploy:' + name, await factory.getDeployTransaction(...args));
    assert.ok(receipt.contractAddress);
    const address = receipt.contractAddress;
    if(state.contracts[name]) assert.equal(state.contracts[name].address, address);
    state.contracts[name] = {address, args, transactionHash:receipt.hash, block:receipt.blockNumber}; await save();
    return new Contract(address, artifacts[name].abi, signer);
  }
  const credits = await deploy(names[0], [operator, ZeroHash, ZeroAddress]);
  const controller = await deploy(names[1], [{operator, credits:await credits.getAddress(), ...settings}, options]);
  const genesis = await deploy('ManekinekoGenesisV14', [await controller.getAddress(), await controller.voting()]);
  await send('bind-genesis', await controller.bindGenesis.populateTransaction(await genesis.getAddress()));
  const holder = await deploy(names[2], [await controller.getAddress()]);
  await send('bind-holder', await controller.bindHolderRewards.populateTransaction(await holder.getAddress()));
  const deployer = await deploy(names[3], [await controller.getAddress()]);
  await send('bind-deployer', await controller.bindDeployer.populateTransaction(await deployer.getAddress()));
  const controllerCodeHash = keccak256(await provider.getCode(await controller.getAddress()));
  await send('approve-controller', await credits.approveFactory.populateTransaction(await controller.getAddress(), controllerCodeHash));
  await send('seal-credits', await credits.sealFactories.populateTransaction());
  for(let i=0;i<catalog.length;i+=10) await send('catalog:' + i, await controller.appendCollections.populateTransaction(catalog.slice(i,i+10)));
  // Publish every executable source BEFORE the immutable 24-hour free window starts.
  const specs = [...Object.entries(state.contracts).map(([name, value]: [string, any]) => ({name,address:value.address,args:value.args})),
    {name:'ManekinekoVotingV14',address:await controller.voting(),args:[await controller.getAddress(),settings.bootstrapAllowed]},
    {name:'ManekinekoRendererV11',address:await controller.renderer(),args:[]}];
  const publications = await publishSources(11155111,specs,directory+'/source-publication.json',{apiKey:process.env.ETHERSCAN_API_KEY!,passes:24,fetcher:transport.fetcher});
  await durable(directory+'/published-sources.json',publications);
  console.log(JSON.stringify({stage:'all-seven-executable-sources-published',count:publications.length}));
  await send('seal-catalog', await controller.sealCatalog.populateTransaction());
  await pipeline.confirmAll();
  assert.equal(await controller.roundCount(), 0n);
  assert.equal(await provider.getBalance(await controller.getAddress()), 0n);
  const expected = {chainId:11155111, genesis:await genesis.getAddress(), genesisCodeHash:keccak256(await provider.getCode(await genesis.getAddress())), controller:await controller.getAddress(), controllerCodeHash, operator, holderRewards:await holder.getAddress(),
    holderRewardsCodeHash:keccak256(await provider.getCode(await holder.getAddress())), credits:await credits.getAddress(), previousRegistry:ZeroAddress,
    legacyMerkleRoot:ZeroHash, settings, catalog, options, creditsDeploymentTx:state.contracts[names[0]].transactionHash};
  await durable(directory + '/expectation.json', expected);
  console.log(JSON.stringify({stage:'deployed-awaiting-finalized-verification', controller:expected.controller, holderRewards:expected.holderRewards, voting:await controller.voting(), renderer:await controller.renderer(), preparedCollections:0}));
} catch(error: any) {
  console.error(JSON.stringify({stage:'stopped', reason:error?.code ?? error?.constructor?.name ?? 'unknown', detail:error?.constructor?.name==='DeploymentError'?error.message:undefined}));
  process.exitCode=1;
} finally { await release(); providers.forEach(p=>p.destroy()); await transport.close(); }
