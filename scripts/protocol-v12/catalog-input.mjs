/** Convert the checked-in V12 identity catalog to the existing offline preparation input. */
import { readFile, writeFile } from 'node:fs/promises';
import { prepare } from './prepare.mjs';
const [network, controller, optionsFile, outputFile] = process.argv.slice(2);
if (!['mainnet','sepolia'].includes(network) || !controller || !optionsFile || !outputFile)
  throw new Error('Usage: node scripts/protocol-v12/catalog-input.mjs mainnet|sepolia CONTROLLER OPTIONS_JSON OUTPUT_JSON');
const catalog = JSON.parse(await readFile(new URL(`../../apps/launch/catalog/${network}.json`, import.meta.url), 'utf8'));
const options = JSON.parse(await readFile(optionsFile,'utf8'));
const plans = catalog.seasons.map(s => ({ chainId:String(catalog.chainId), seasonId:s.seasonId, name:s.name, steps:s.collections.map(c=>({payload:{contract:{chainId:String(catalog.chainId),seasonId:s.seasonId,seasonName:s.name,name:c.name,symbol:c.symbol,collectionColor:c.color,textColor:c.textColor}}})) }));
const result = await prepare({chainId:catalog.chainId,controller,options,plans});
await writeFile(outputFile, JSON.stringify(result,null,2)+'\n', {flag:'wx',mode:0o600});
console.log(`Prepared ${result.catalog.length} catalog entries. No transaction submitted.`);
