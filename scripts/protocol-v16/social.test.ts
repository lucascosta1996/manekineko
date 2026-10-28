import test from 'node:test';
import assert from 'node:assert/strict';
import mainnet from '../../apps/launch/catalog/mainnet.json' with { type: 'json' };
import sepolia from '../../apps/launch/catalog/sepolia.json' with { type: 'json' };
import { genesisStages, collectionStages, GENESIS_STAGES, COLLECTION_STAGES, SEASON_STAGES, STAGES, message } from './social-content.ts';
import { previewMessage } from './social-preview.ts';
import { mergeObservations, assertPublishable } from '../protocol-v12/social.ts';
import { observeV16 } from './social.mts';
import { renderSeasonSocialImage } from '../season-runner/social-image.ts';
const r = { voteStart: 10n, saleStart: 100n, deadline: 200n, soldOutAt: 0n, entropyAt: 0n, finalizedAt: 0n, prizesClaimed: 0n, winners: 6n };
test('Genesis posts require sealing and the real opening; no deadline can synthesize sellout', () => {
  assert.deepEqual(genesisStages(false, 10n, 0n, 20n), []);
  assert.deepEqual(genesisStages(true, 10n, 0n, 9n), []);
  assert.deepEqual(genesisStages(true, 10n, 0n, 100000000n), ['genesis-open']);
  assert.deepEqual(genesisStages(true, 10n, 20n, 20n), GENESIS_STAGES);
  const open = previewMessage(sepolia, 0, 'genesis-open');
  assert.match(open.post, /first collection starts with voting as soon as Genesis sells out/);
  assert.match(open.post, /Paid minting follows the ballot/);
  assert.match(open.post, /gas applies/);
  assert.equal(open.kind, 'genesis');
});
test('zero schedule never announces paid events; time boundaries and draw outcomes stay distinct', () => {
  assert.deepEqual(collectionStages({ ...r, voteStart: 0n, saleStart: 0n, deadline: 0n }, 1000000n), []);
  assert.deepEqual(collectionStages(r, 10n), ['prepared', 'voting']);
  assert.deepEqual(collectionStages(r, 100n), ['prepared', 'voting', 'opening']);
  assert(collectionStages(r, 200n).includes('refunds'));
  const sold = { ...r, soldOutAt: 150n };
  assert(!collectionStages(sold, 259349n).includes('draw-refunds'));
  assert(collectionStages(sold, 259350n).includes('draw-refunds'));
  assert(!collectionStages({ ...sold, entropyAt: 160n }, 259350n).some(s => s.endsWith('refunds')));
  assert(!collectionStages({ ...sold, finalizedAt: 170n, prizesClaimed: 5n }, 200n).includes('paid'));
  assert(collectionStages({ ...sold, finalizedAt: 170n, prizesClaimed: 6n }, 200n).includes('paid'));
});
test('all 216 catalog identities in both networks fit every X template, with explicit test labeling', () => {
  for (const catalog of [mainnet, sepolia]) {
    let id = 0;
    for (const season of catalog.seasons) for (const collection of season.collections) {
      id++;
      for (const stage of [...COLLECTION_STAGES, ...SEASON_STAGES]) {
        const content = previewMessage(catalog, id, stage);
        assert.equal(content.collection?.name, collection.name);
        assert.equal(content.collection?.color, collection.color);
        assert.deepEqual(content.season.colors, season.collections.map(c => c.color));
        assert.equal(content.post.includes('Sepolia testnet'), catalog.chainId === 11155111);
        assert.match(content.post, /https:\/\/app\.tincta\.xyz\/\?collection=/);
      }
    }
    assert.equal(id, 216);
    for (const stage of GENESIS_STAGES) previewMessage(catalog, 0, stage);
  }
  assert.throws(() => previewMessage(mainnet, 0, 'opening'));
  assert.throws(() => previewMessage(mainnet, 217, 'opening'));
});
test('Genesis is outside season numbering and PNGs contain the same marked preview as Launch', async () => {
  for (const catalog of [mainnet, sepolia]) for (const stage of GENESIS_STAGES) {
    const content = previewMessage(catalog, 0, stage);
    const rendered = await renderSeasonSocialImage(content, { preview: true });
    assert.equal(rendered.png.readUInt32BE(16), 1600); assert.equal(rendered.png.readUInt32BE(20), 900);
    assert.match(rendered.svg, /DESIGN PREVIEW/);
    if (catalog.chainId === 11155111) assert.match(rendered.svg, /SEPOLIA TEST/);
    assert.match(rendered.svg, /data-tincta-logo="mark"/);
    assert.doesNotMatch(rendered.svg, /data-tincta-artwork="open"/);
    assert.match(rendered.svg, /data:image\/svg\+xml;base64,/);
    assert(!rendered.svg.includes('SEASON 00')); assert(!rendered.svg.includes('COLLECTION 00'));
  }
});
test('outbox orders Genesis before seasons and preserves sent or uncertain content', () => {
  const entries = ['1:opening','0:genesis-soldout','1:season-open','0:genesis-open'].map(key => ({ key: `11155111:contract:${key}`, text: key, block: 10, blockHash: '0x01' }));
  const merged = mergeObservations([], entries, STAGES);
  assert.deepEqual(merged.map(e => e.text), ['0:genesis-open','0:genesis-soldout','1:season-open','1:opening']);
  merged[0].status = 'sent'; merged[1].status = 'uncertain';
  const updated = mergeObservations(merged, entries.map(e => ({ ...e, text: 'new' })), STAGES);
  assert.equal(updated[0].text, '0:genesis-open'); assert.equal(updated[1].text, '0:genesis-soldout');
  assert.throws(() => assertPublishable(updated), /Reconcile/);
});
test('observer rejects historical configs, Mainnet and unsafe app URLs before network access', async () => {
  const config = { version: 16 as const, chainId: 11155111, controller: '0x'+'11'.repeat(20), controllerCodeHash: '0x'+'22'.repeat(32), rpcUrl: 'https://rpc.invalid', appUrl: 'https://app.tincta.xyz/', xAccountId: '123' };
  await assert.rejects(observeV16({ ...config, version: 14 }), /dedicated V16/);
  await assert.rejects(observeV16({ ...config, chainId: 1 }), /dedicated V16/);
  await assert.rejects(observeV16({ ...config, appUrl: 'http://localhost:3100' }), /HTTPS/);
  await assert.rejects(observeV16({ ...config, appUrl: 'https://app.tincta.xyz/?affiliate=1' }), /origin/);
});
test('maximum onchain names fit and allocation exceptions are never presented as guaranteed payouts', () => {
  for (const stage of [...COLLECTION_STAGES, ...SEASON_STAGES]) {
    const base = previewMessage(mainnet, 1, stage);
    for (const name of ['W'.repeat(80), '界'.repeat(26), '🟠'.repeat(20)]) {
      const m = message({ stage, chainId: 11155111, id: 216, timestamp: 1793145600, appUrl: 'https://app.tincta.xyz/', season: { ...base.season, name }, collection: { ...base.collection!, name } });
      if (stage === 'opening') assert.match(m.footer, /No qualifying affiliates/);
    }
  }
});
