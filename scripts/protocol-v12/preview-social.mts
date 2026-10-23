/** Offline design previews; no credentials, RPC requests or X writes. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { lifecycleMessages, socialImage, STAGES } from './social-content.ts';
import { renderSeasonSocialImage } from '../season-runner/social-image.ts';
const directory = resolve(process.argv[2] ?? 'output/social/v12');
await mkdir(directory, { recursive: true });
const entries: { file: string; text: string }[] = [];
for (const network of ['mainnet', 'sepolia'] as const) {
  const catalog = JSON.parse(await readFile(new URL(`../../apps/launch/catalog/${network}.json`, import.meta.url), 'utf8'));
  const plan = catalog.seasons[0], first = plan.collections[0];
  const season = { id: plan.seasonId, number: 1, name: plan.name, colors: plan.collections.map((c: {color: string}) => c.color) };
  const collection = { id: 'preview', number: 1, name: first.name, color: first.color, supply: 1000, mintPriceEth: '0.01', winnerCount: 6, prizePerWinnerEth: '1' };
  const input = { prefix: network === 'sepolia' ? '[Sepolia testnet] ' : '', name: first.name, id: 1, link: 'https://app.tincta.xyz/collections', now: 300n, voteStart: 10n, saleStart: 20n, deadline: 30n, sold: true, revealed: true, paid: true, randomnessDeadline: 200n, randomnessReceived: true };
  const messages = [...lifecycleMessages(input), ...lifecycleMessages({ ...input, sold: false, revealed: false, paid: false, randomnessReceived: false }), ...lifecycleMessages({ ...input, revealed: false, paid: false, randomnessReceived: false })];
  for (const stage of STAGES) {
    const message = messages.find(m => m.stage === stage)!;
    const image = socialImage({ chainId: catalog.chainId, stage, season, collection, timestamp: 1792627200, text: message.text });
    const rendered = await renderSeasonSocialImage(image, { preview: true });
    const file = `${network}-${stage}`;
    await writeFile(join(directory, `${file}.svg`), rendered.svg);
    await writeFile(join(directory, `${file}.png`), rendered.png);
    entries.push({ file, text: message.text });
  }
}
const xml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await writeFile(join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tincta Rewards — V12 post previews</title><style>body{font:16px/1.5 system-ui;margin:32px auto;padding:0 24px;max-width:1000px;color:#111}article{margin:48px 0}img{width:100%;height:auto;border:1px solid #ddd}pre{white-space:pre-wrap;font:inherit}h1{font-size:28px}</style><h1>Tincta Rewards · V12 post previews</h1><p>Fictional lifecycle examples. Nothing was published. Mainnet catalog identity and independently named Sepolia catalog retain their colors and order.</p>${entries.map(e => `<article><h2>${xml(e.file)}</h2><img src="${e.file}.png" alt="${xml(e.file)} design preview"><pre>${xml(e.text)}</pre></article>`).join('')}</html>`);
console.log(`Wrote ${entries.length} offline branded previews to ${directory}`);
