import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleMessages, mergeObservations, deliveryFailureStatus } from './social.ts';
import { XApiError, AmbiguousDelivery } from '../season-runner/social.ts';
const base = {
  prefix: '[Sepolia testnet] ',
  name: 'Fictional one',
  id: 1,
  link: 'https://app.tincta.xyz/collections',
  now: 10n,
  voteStart: 20n,
  saleStart: 30n,
  deadline: 50n,
  sold: false,
  revealed: false,
  paid: false,
  randomnessDeadline: 200n,
  randomnessReceived: false,
};
test('deadline events exist without a blockchain timer transaction', () => {
  assert.deepEqual(
    lifecycleMessages(base).map((e) => e.key),
    ['1:prepared']
  );
  assert.deepEqual(
    lifecycleMessages({ ...base, now: 50n }).map((e) => e.key),
    ['1:prepared', '1:voting', '1:opening', '1:refunds']
  );
  assert(!lifecycleMessages({ ...base, now: 100n, sold: true }).some((e) => e.key.endsWith('refunds')));
});
test('draw timeout and irrevocable recorded randomness have distinct announcements', () => {
  const expired = lifecycleMessages({ ...base, sold: true, now: 200n });
  assert(expired.some(e => e.key === '1:draw-refunds'));
  const recorded = lifecycleMessages({ ...base, sold: true, now: 200n, randomnessReceived: true });
  assert(!recorded.some(e => e.key.endsWith('refunds')));
  assert(recorded.some(e => e.key === '1:draw-ready'));
});
test('canonical observations never overwrite a sent or uncertain delivery', () => {
  const e = { key: '1:opening', text: 'Opened', block: 10, blockHash: '0x01' };
  const initial = mergeObservations([], [e]);
  assert.equal(initial[0].status, 'pending');
  initial[0].status = 'uncertain';
  const next = mergeObservations(initial, [{ ...e, block: 11 }]);
  assert.equal(next.length, 1);
  assert.equal(next[0].status, 'uncertain');
  assert.equal(next[0].block, 10);
});

test('late observers keep chronological, historical wording after a timeout or final draw', () => {
  const expired = lifecycleMessages({ ...base, sold: true, now: 200n });
  assert.deepEqual(expired.map(e => e.key), ['1:prepared', '1:voting', '1:opening', '1:soldout', '1:draw-refunds']);
  assert.match(expired.find(e => e.key === '1:soldout')!.text, /sellout milestone/);
  assert(!expired.some(e => e.text.includes('will be fixed')));
  const finalized = lifecycleMessages({ ...base, sold: true, now: 200n, randomnessReceived: true, revealed: true, paid: true });
  assert.deepEqual(finalized.slice(-3).map(e => e.key), ['1:draw-ready', '1:revealed', '1:paid']);
  assert.match(finalized.find(e => e.key === '1:revealed')!.text, /qualified affiliates/);
});
test('every message fits X with maximum onchain name bytes and network branding', () => {
  for (const name of ['W'.repeat(80), '界'.repeat(26), '🟠'.repeat(20)]) {
    for (const prefix of ['', '[Sepolia testnet] ']) {
      for (const state of [{ sold: false }, { sold: true }, { sold: true, randomnessReceived: true, revealed: true, paid: true }]) {
        const messages = lifecycleMessages({ ...base, name, prefix, id: 256, now: 200n, ...state });
        assert(messages.length);
        assert(messages.every(e => e.text.startsWith('Tincta Rewards')));
      }
    }
  }
});
test('branding refresh changes only pending delivery and unresolved intent blocks the whole queue', async () => {
  const { assertPublishable } = await import('./social.ts');
  const observations = ['paid', 'opening', 'revealed'].map(stage => ({ key: `1:controller:1:${stage}`, text: stage, block: 10, blockHash: '0x01' }));
  const existing = mergeObservations([], observations);
  existing[0].text = 'old pending copy';
  existing[1].status = 'sent'; existing[1].text = 'immutable sent copy';
  existing[2].status = 'uncertain'; existing[2].text = 'immutable uncertain copy';
  const next = mergeObservations(existing, observations);
  assert.equal(next[0].text, 'opening');
  assert.equal(next[1].text, 'immutable sent copy');
  assert.equal(next[2].text, 'immutable uncertain copy');
  assert.throws(() => assertPublishable(next), /Reconcile/);
  next[2].status = 'intent';
  assert.throws(() => assertPublishable(next), /Reconcile/);
  next[2].status = 'sent';
  assert.doesNotThrow(() => assertPublishable(next));
});

test('V12 image cards reuse canonical Mainnet branding and visibly distinguish Sepolia', async () => {
  const { socialImage, STAGES } = await import('./social-content.ts');
  const { renderSeasonSocialSvg } = await import('../season-runner/social-image.ts');
  const { TINCTA_SOCIAL_LOCKUP_SVG } = await import('../../packages/contracts/src/tincta-brand.ts');
  for (const chainId of [1, 11155111] as const) for (const stage of STAGES) {
    const message = socialImage({ chainId, stage, timestamp: 1792627200, text: 'Preview',
      season: { id: '0x' + '11'.repeat(32), number: 1, name: 'Test & identity', colors: ['#330000', '#FFFFFF'] },
      collection: { id: 'test', number: 1, name: 'W'.repeat(80), color: '#330000', supply: 1000, mintPriceEth: '0.01', winnerCount: 6, prizePerWinnerEth: '1' },
    });
    const svg = renderSeasonSocialSvg(message, { preview: true });
    assert.match(svg, /DESIGN PREVIEW/);
    assert.match(svg, /Test &amp; identity/);
    assert.match(svg, /textLength=/);
    if (chainId === 1) assert(svg.includes(TINCTA_SOCIAL_LOCKUP_SVG));
    else { assert.match(svg, /Sepolia collections/); assert.match(svg, /SEPOLIA TEST · TEST ETH/); }
  }
});

test('only ambiguous post delivery needs reconciliation; explicit rejection remains retryable', async () => {
  assert.equal(deliveryFailureStatus(new Error('canonical preflight failed'), false), 'pending');
  assert.equal(deliveryFailureStatus(new XApiError('Forbidden', 403), true), 'pending');
  assert.equal(deliveryFailureStatus(new XApiError('Rate limit', 429), true), 'pending');
  assert.equal(deliveryFailureStatus(new AmbiguousDelivery(), true), 'uncertain');
  assert.equal(deliveryFailureStatus(new AmbiguousDelivery('Server', 503), true), 'uncertain');
  assert.equal(deliveryFailureStatus(new Error('Could not persist successful POST'), true), 'uncertain');
});
