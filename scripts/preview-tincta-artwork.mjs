import { mkdir, writeFile } from "node:fs/promises";
import { loadNamedSeasonCatalog } from "./season-catalog.mjs";
import { sha256, toUtf8Bytes } from "ethers";
import { buildTinctaSvg, getTinctaMotif, TINCTA_MOTIF_NAMES } from "../packages/contracts/src/tincta-artwork.ts";
import { contrastTextColor } from "../packages/contracts/src/season-appearance.ts";
import { encodeScrambledRank } from "../packages/contracts/src/scrambled-rank.ts";

// Reproducible review artifacts, not minted NFTs. No RPC, database or external assets.
const seasons = await loadNamedSeasonCatalog();
const output = new URL("../docs/brand/tincta/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("collection-names.md", output), [
  "# Tincta collection names",
  "Names follow each season's theme and exact color progression. The existing season order, colors and artwork geometry are preserved. These are names for future launches; deployed collections retain their original identities. Upcoming public teasers show only colors.",
  "Source: `seasons.json` and `collection-names.json`. Regenerate with `node --import tsx scripts/preview-tincta-artwork.mjs`.",
  ...seasons.map(season => `## ${String(season.season).padStart(2, "0")} — ${season.theme}\n\n| Collection | Color | Name |\n| --- | --- | --- |\n${season.namedCollections.map((item, index) => `| ${String(index + 1).padStart(2, "0")} | ${item.color} | ${item.name} |`).join("\n")}`),
].join("\n\n") + "\n");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const pad = value => String(value).padStart(2, "0");
const canonicalSeasonId = season => sha256(toUtf8Bytes(`manekineko:seasons.json:chain:1:season:${season.season}`));
const motifName = season => TINCTA_MOTIF_NAMES[getTinctaMotif(canonicalSeasonId(season))];
const demonstration = encodeScrambledRank(512, `0x${"42".repeat(32)}`);
const svgFor = (season, color, props = {}) => buildTinctaSvg({
  seasonId: canonicalSeasonId(season), seasonName: season.theme, collectionName: season.namedCollections.find(item => item.color === color).name, collectionColor: color,
  textColor: contrastTextColor(color), tokenId: 42, state: "revealed", numbers: demonstration.numbers, score: demonstration.score,
  ...props,
});
const css = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif;-webkit-font-smoothing:antialiased}main{max-width:1480px;margin:auto;padding:60px 56px 72px}header{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:1px solid #ddd;padding-bottom:24px}header strong{font-size:26px;letter-spacing:-1px}header span,.kicker{font-size:11px;letter-spacing:2px;text-transform:uppercase}.intro{display:flex;align-items:end;justify-content:space-between;gap:48px;margin:52px 0 34px}h1{font-size:clamp(40px,5vw,70px);letter-spacing:-3px;line-height:1.05;font-weight:500;margin:14px 0 0}.intro p{font-size:14px;line-height:1.7;color:#666;max-width:390px}a{color:inherit;text-underline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:10px 18px;margin:28px 0 48px;font-size:12px;color:#666}.season{margin-top:64px;scroll-margin-top:28px}.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:24px;padding-top:26px;border-top:1px solid #ddd}h2{font-size:28px;letter-spacing:-.7px;font-weight:500;margin:10px 0 0}.section-heading p{max-width:330px;font-size:12px;line-height:1.7;color:#666;margin:0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:42px 28px}figure{margin:0}img{display:block;width:100%;height:auto;border:1px solid #eee;border-radius:5px}figcaption{display:flex;justify-content:space-between;gap:12px;padding:17px 0;font-size:10px;line-height:1.5;color:#666}figcaption span:first-child{font-family:monospace}.motif-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 24px}.motif-grid h2{font-size:19px;letter-spacing:-.3px;margin:14px 0 7px}.motif-grid p{font-size:12px;line-height:1.5;margin:0;color:#666}.motif-grid figcaption{display:block;padding-top:12px}.specimen-note{padding:16px 20px;border:1px solid #e5e5e5;background:#f8f8f8;font-size:12px;line-height:1.7;color:#666}footer{margin-top:64px;border-top:1px solid #ddd;padding-top:22px;font-size:12px;line-height:1.7;color:#666}@media(max-width:1000px){.motif-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:800px){main{padding:30px 22px}.intro,.section-heading{display:block}.section-heading p{margin-top:14px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 14px}.season .grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.season figcaption{font-size:9px}figcaption{display:block}figcaption span{display:block}}@media(max-width:580px){.season .grid,.grid{grid-template-columns:1fr}.motif-grid{grid-template-columns:repeat(2,minmax(0,1fr))}header span{font-size:8px}h1{letter-spacing:-2px}.season{margin-top:42px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;
const document = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><main>${body}</main></body></html>`;
const header = `<header><strong>Tincta</strong><span>On-chain artwork / Study 02</span></header>`;
const footer = `<footer>Design specimens only. Numbers use a fixed demonstration key; they are not minted tokens or predicted results. Colors and season order come directly from seasons.json; collection names come from collection-names.json. SVG artwork is generated from the same deterministic rules as the on-chain renderer, without external fonts, images or scripts.</footer>`;
const seasonSections = [], overview = [];
for (const season of seasons) {
  const cards = [];
  const collectionIndices = [0, Math.floor(season.collections.length / 2), season.collections.length - 1];
  for (const index of collectionIndices) {
    const color = season.collections[index];
    const filename = `season-${pad(season.season)}-collection-${pad(index + 1)}.svg`;
    const svg = svgFor(season, color);
    await writeFile(new URL(filename, output), svg);
    cards.push(`<figure><a href="${filename}" aria-label="Open ${escapeHtml(season.theme)} collection ${index + 1} SVG"><img loading="lazy" src="${filename}" width="640" height="800" alt="${escapeHtml(season.theme)} ${color} ${escapeHtml(motifName(season))} specimen"></a><figcaption><span>S${pad(season.season)} / C${pad(index + 1)} · ${color}</span><span>Ticket #42 · score 512</span></figcaption></figure>`);
  }
  seasonSections.push(`<section id="season-${pad(season.season)}" class="season"><div class="section-heading"><div><span class="kicker">Season ${pad(season.season)} / ${escapeHtml(motifName(season))}</span><h2>${escapeHtml(season.theme)}</h2></div><p>First, middle and final collection. One seasonal motif with small collection-specific variations.</p></div><div class="grid">${cards.join("")}</div></section>`);

  // The monochrome crop uses the actual first collection geometry. Recolor only
  // after rendering so the decorative seed remains tied to the original color.
  const color = season.collections[0], text = contrastTextColor(color);
  const crop = svgFor(season, color)
    .replace('width="640" height="800" viewBox="0 0 640 800"', 'width="640" height="360" viewBox="0 176 640 360"')
    .replaceAll(`fill="${text}"`, 'fill="#111111"')
    .replaceAll(`stroke="${text}"`, 'stroke="#111111"')
    .replace(`fill="${color}"`, 'fill="#FFFFFF"');
  const filename = `motif-season-${pad(season.season)}.svg`;
  await writeFile(new URL(filename, output), crop);
  overview.push(`<figure><a href="artwork-preview.html#season-${pad(season.season)}"><img loading="lazy" src="${filename}" width="640" height="360" alt="${escapeHtml(motifName(season))} linework in monochrome"></a><figcaption><span class="kicker">Season ${pad(season.season)}</span><h2>${escapeHtml(motifName(season))}</h2><p>${escapeHtml(season.theme)}</p></figcaption></figure>`);
}

// Keep the original six URLs current for previous review links and all states.
const samples = [
  [0, 0, "revealed", 42, 512, 0], [0, 8, "revealed", 16, 1000, 1], [0, 9, "sealed", 1, 0, 0],
  [13, 4, "revealed", 128, 997, 4], [5, 5, "refundable", 9, 0, 0], [21, 5, "revealed", 65536, 1, 0],
];
const stateCards = [];
for (let i = 0; i < samples.length; i++) {
  const [seasonIndex, collectionIndex, state, tokenId, score, awardRank] = samples[i];
  const season = seasons[seasonIndex], color = season.collections[collectionIndex];
  const combination = score ? encodeScrambledRank(score, `0x${"42".repeat(32)}`) : null;
  const svg = svgFor(season, color, { tokenId, state, numbers: combination?.numbers, score: score || undefined, awardRank });
  const filename = `edition-${pad(i + 1)}.svg`;
  await writeFile(new URL(filename, output), svg);
  stateCards.push(`<figure><a href="${filename}"><img loading="lazy" src="${filename}" width="640" height="800" alt="${escapeHtml(season.theme)} ${color} ${state} specimen"></a><figcaption><span>S${pad(season.season)} / C${pad(collectionIndex + 1)} · ${color}</span><span>${awardRank ? `Winning edition · award ${awardRank}` : state}</span></figcaption></figure>`);
}

await writeFile(new URL("artwork-preview.html", output), document("Tincta — 22 seasonal motifs", `${header}<section class="intro"><div><span class="kicker">Color, collected.</span><h1>A signature<br>for every season.</h1></div><p>22 distinct geometric families. Small variations across each collection. Explore the full season order below, or compare the <a href="motifs-preview.html">linework in monochrome</a>.</p></section><p class="specimen-note">All 66 season specimens use the same ticket #42, four numbers and score 512. The geometry differences come from season and collection identity, not different competition results. Select an artwork to open its SVG.</p><nav aria-label="Season navigation">${seasons.map(season => `<a href="#season-${pad(season.season)}">${pad(season.season)}</a>`).join("")}<a href="#states">Artwork states</a></nav>${seasonSections.join("")}<section id="states" class="season"><div class="section-heading"><div><span class="kicker">Edition states</span><h2>Before and after the reveal.</h2></div><p>The original six specimens, updated with seasonal linework. This section includes sealed, revealed, winning and refundable examples.</p></div><div class="grid">${stateCards.join("")}</div></section>${footer}`));
await writeFile(new URL("motifs-preview.html", output), document("Tincta — Seasonal linework overview", `${header}<section class="intro"><div><span class="kicker">22 seasons / 22 signatures</span><h1>Distinct by design.</h1></div><p>The first collection of each season, shown in monochrome with identical ticket data. Color is removed only for this comparison. <a href="artwork-preview.html">View collection variations</a>.</p></section><div class="grid motif-grid">${overview.join("")}</div>${footer}`));
console.log("Wrote 66 seasonal specimens, 22 monochrome motif crops, six state specimens and two review boards in docs/brand/tincta/");
