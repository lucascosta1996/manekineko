/** Offline only: validate saved draft identities and produce reviewable wallet calldata. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Interface, getAddress, isHexString } from 'ethers';
import { loadNamedSeasonCatalog } from '../season-catalog.mjs';
import controllerAbi from '../../packages/contracts/src/ManekinekoSeasonControllerV12.json' with { type: 'json' };
const UINT_MAX = (1n << 256n) - 1n;
export function validateOptions(options) {
  assert(
    Array.isArray(options) && options.length >= 1 && options.length <= 8,
    'Provide 1–8 economic packages.'
  );
  const seen = new Set();
  return options.map((o) => {
    for (const key of ['supply', 'price', 'winners', 'duration'])
      assert(
        typeof o[key] === 'string' && /^[1-9][0-9]*$/.test(o[key]),
        `${key} must be an exact positive integer string; price is wei.`
      );
    const t = Object.fromEntries(['supply', 'price', 'winners', 'duration'].map((k) => [k, BigInt(o[k])]));
    assert(
      t.supply >= 1000n && t.supply <= 65536n &&
        t.price >= 10n ** 16n &&
        t.price % 10000n === 0n &&
        t.price <= UINT_MAX / t.supply,
      'Supply must be 1,000–65,536 and mint price at least 0.01 ETH, in 10,000-wei increments, without revenue overflow.'
    );
    assert(
      t.winners <= 10n && t.winners <= t.supply && 6000n % t.winners === 0n,
      'Prizes must divide the fixed 60% allocation exactly.'
    );
    assert(t.duration >= 3600n && t.duration <= 86400n, 'Mint duration must be 1–24 hours.');
    const key = Object.values(t).join(':');
    assert(!seen.has(key), 'Duplicate economic package.');
    seen.add(key);
    return t;
  });
}
export async function preserveCatalog(plans, chainId) {
  assert([1, 11155111].includes(chainId), 'Choose Ethereum Mainnet or Sepolia explicitly.');
  assert(Array.isArray(plans) && plans.length > 0, 'Export existing saved season plans first.');
  const canonical = await loadNamedSeasonCatalog(),
    output = [],
    seen = new Set();
  if (chainId === 1)
    assert.equal(plans.length, canonical.length, 'Mainnet requires the complete 22-season catalog.');
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    assert.equal(String(p.chainId), String(chainId), 'Never change an existing plan network.');
    assert(
      isHexString(p.seasonId, 32) && !/^0x0+$/.test(p.seasonId) && !seen.has(p.seasonId.toLowerCase()),
      'Preserve unique existing season IDs.'
    );
    seen.add(p.seasonId.toLowerCase());
    assert(p.steps.length >= 1 && p.steps.length <= 10, 'A season has 1–10 collections.');
    if (chainId === 1) {
      const id = `0x${createHash('sha256')
        .update(`manekineko:seasons.json:chain:1:season:${canonical[i].season}`)
        .digest('hex')}`;
      assert.equal(p.seasonId, id, 'Saved Mainnet identity or order differs.');
      assert.equal(p.name, canonical[i].theme);
      assert.equal(p.steps.length, canonical[i].namedCollections.length);
    } else {
      const mainnetIds = canonical.map(
        (s) =>
          `0x${createHash('sha256')
            .update(`manekineko:seasons.json:chain:1:season:${s.season}`)
            .digest('hex')}`
      );
      assert(
        !mainnetIds.includes(p.seasonId.toLowerCase()),
        'Mainnet identities cannot be copied into Sepolia.'
      );
      assert(!canonical.some((s) => s.theme === p.name), 'Sepolia uses independent fictional season names.');
    }
    for (let j = 0; j < p.steps.length; j++) {
      const c = p.steps[j].payload.contract;
      assert.equal(c.seasonId, p.seasonId);
      assert.equal(c.seasonName, p.name);
      assert.equal(String(c.chainId), String(chainId));
      if (chainId === 1) {
        assert.equal(c.name, canonical[i].namedCollections[j].name);
        assert.equal(c.collectionColor, canonical[i].namedCollections[j].color);
      }
      for (const [value, max] of [
        [c.name, 80],
        [p.name, 64],
        [c.symbol, 16],
      ])
        assert(
          typeof value === 'string' &&
            Buffer.byteLength(value) > 0 &&
            Buffer.byteLength(value) <= max &&
            !/[\x00-\x1f\x7f<>]/.test(value),
          'Invalid onchain name.'
        );
      assert(
        /^#[0-9a-fA-F]{6}$/.test(c.collectionColor) && ['#FFFFFF', '#000000'].includes(c.textColor),
        'Preserve valid artwork colors.'
      );
      output.push({
        seasonId: p.seasonId,
        seasonName: p.name,
        name: c.name,
        symbol: c.symbol,
        color: c.collectionColor,
        textColor: c.textColor,
      });
    }
  }
  assert(output.length <= 256);
  return output;
}
export async function prepare(input) {
  const options = validateOptions(input.options),
    catalog = await preserveCatalog(input.plans, input.chainId);
  const controller = getAddress(input.controller),
    abi = new Interface(controllerAbi);
  // Intentionally no RPC, signer, deployment, DB access or broadcast path.
  const transactions = [];
  for (let i = 0; i < catalog.length; i += 10)
    transactions.push({
      purpose: `Append catalog positions ${i + 1}–${Math.min(i + 10, catalog.length)}`,
      to: controller,
      value: '0',
      data: abi.encodeFunctionData('appendCollections', [catalog.slice(i, i + 10)]),
    });
  return {
    schemaVersion: 1,
    chainId: input.chainId,
    controller,
    options: options.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, String(v)]))),
    catalog,
    catalogHash: `0x${createHash('sha256').update(JSON.stringify(catalog)).digest('hex')}`,
    transactions,
    prerequisites: [
      'Deploy reviewed Credits V8 with preserved ancestry and legacy root; permanently retire previous funded mint destinations.',
      'Deploy controller with exactly these economic options; verify runtime and all dependency pins.',
      'Bind the reviewed V12 deployer and approve the controller runtime in Credits V8.',
      'Import reviewed historical voting sources before sealing, if migrating.',
      'Review every approved factory and permanently seal Credits V8 with sealFactories(); later factory approvals are impossible.',
      'Review every catalog batch onchain before signing sealCatalog().',
      'Fund preparation separately from mint receipts; prepareNext starts the immutable voting schedule.',
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'Usage: node scripts/protocol-v12/prepare.mjs input.json output.json');
  await writeFile(
    output,
    JSON.stringify(await prepare(JSON.parse(await readFile(input, 'utf8'))), null, 2) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
  console.log('Offline catalog transaction bundle written. Nothing was broadcast.');
}
