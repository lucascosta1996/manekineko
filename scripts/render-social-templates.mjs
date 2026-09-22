import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { sha256, toUtf8Bytes } from "ethers";
import { loadNamedSeasonCatalog } from "./season-catalog.mjs";
import { buildTinctaLinework } from "../packages/contracts/src/tincta-motifs.ts";
import { contrastTextColor } from "../packages/contracts/src/season-appearance.ts";

// Local review assets only. No RPC, database, wallet, scheduler or X writes.
const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(root, "docs/brand/tincta/social");
const { values: options } = parseArgs({ options: {
  data: { type: "string" }, output: { type: "string" },
} });
const output = resolve(options.output ?? source);
const data = JSON.parse(await readFile(resolve(options.data ?? resolve(source, "example-data.json")), "utf8"));
if (data.status !== "design-preview") throw new Error("This renderer produces design previews only; live event verification is not implemented.");
const catalog = await loadNamedSeasonCatalog();
const season = catalog.find(item => item.season === data.seasonNumber);
const collection = season?.namedCollections[data.collectionNumber - 1];
if (!collection) throw new Error("Choose an existing catalog season and collection in the input JSON.");
for (const key of ["supply", "winnerCount", "collectionsSoldOut", "seasonNftsMinted"]) {
  if (!Number.isSafeInteger(data[key]) || data[key] < 0) throw new Error(`Invalid preview count: ${key}`);
}
if (data.supply < 1 || data.winnerCount < 1 || data.winnerCount > Math.min(10, data.supply) || data.collectionsSoldOut > season.collections.length) throw new Error("Invalid preview collection or season totals.");
for (const key of ["mintPriceEth", "prizePerWinnerEth", "seasonPrizesClaimedEth", "seasonAffiliateClaimedEth"]) {
  if (typeof data[key] !== "string" || !/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(data[key])) throw new Error(`Use a decimal string for ${key}.`);
}
const templates = JSON.parse(await readFile(resolve(source, "post-templates.json"), "utf8")).templates;
const pad = value => String(value).padStart(2, "0");
const xml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
function timestamp(value) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().replace(".000Z", "Z") !== value) throw new Error(`Invalid UTC timestamp: ${value}`);
  return date;
}
function dateText(value) {
  const date = timestamp(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}
function countdown(start, end) {
  const minutes = Math.ceil((timestamp(end) - timestamp(start)) / 60_000);
  if (minutes < 1) throw new Error("Opening countdowns must be positive.");
  return minutes % 60 === 0 ? `${minutes / 60}h` : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
if (timestamp(data.mintDeadline) <= timestamp(data.saleStartAt)) throw new Error("The preview deadline must follow the mint opening.");
const fields = {
  ...data,
  seasonNumber: pad(season.season), collectionNumber: pad(data.collectionNumber),
  seasonName: season.theme, collectionName: collection.name,
  collectionCount: String(season.collections.length),
  supply: data.supply.toLocaleString("en-US"),
  seasonNftsMinted: data.seasonNftsMinted.toLocaleString("en-US"),
  enrollmentCountdown: countdown(data.enrollmentNoticeAt, data.enrollmentOpensAt),
  mintCountdown: countdown(data.enrollmentOpensAt, data.saleStartAt),
};
for (const key of ["enrollmentOpensAt", "saleStartAt", "mintDeadline", "seasonSnapshotAt"]) {
  fields[`${key}Text`] = dateText(data[key]);
  fields[`${key}Image`] = dateText(data[key]).replace(", ", " · ").toUpperCase();
}
function substitute(template, values = fields) {
  const rendered = template.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => {
    if (values[key] === undefined || values[key] === null || String(values[key]).trim() === "") throw new Error(`Missing template value: ${key}`);
    return String(values[key]);
  });
  if (/[{}\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(rendered)) throw new Error("Unresolved or invalid template content.");
  return rendered;
}

const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const mono = '"SFMono-Regular", "SF Mono", Menlo, "Liberation Mono", monospace';
const css = `<style>text{font-family:${font}}.mono{font-family:${mono}}</style>`;
const measured = new Map();
async function fitted(text, preferred, maxWidth, weight = 500, spacing = -4, isMono = false) {
  const key = JSON.stringify([text, preferred, maxWidth, weight, spacing, isMono]);
  if (measured.has(key)) return measured.get(key);
  let size = preferred;
  for (let attempt = 0; attempt < 4; attempt++) {
    const specimen = `<svg xmlns="http://www.w3.org/2000/svg" width="4800" height="400">${css}<text x="30" y="240" fill="#111111" ${isMono ? 'class="mono"' : ""} font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}">${xml(text)}</text></svg>`;
    const { info } = await sharp(Buffer.from(specimen)).trim().png().toBuffer({ resolveWithObject: true });
    if (info.width <= maxWidth) {
      measured.set(key, size);
      return size;
    }
    size = Math.floor(size * maxWidth / info.width) - 1;
  }
  throw new Error(`Could not fit text: ${text}`);
}
function contrast(color, foreground) {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const light = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return foreground === "#FFFFFF" ? 1.05 / (light + 0.05) : (light + 0.05) / 0.05;
}
const bands = season.collections.map((color, index) => ({
  color, index,
  x: 48 + Math.round(index * 1504 / season.collections.length),
  width: Math.round((index + 1) * 1504 / season.collections.length) - Math.round(index * 1504 / season.collections.length),
  foreground: contrastTextColor(color),
}));
const titleColors = bands.filter(band => band.x < 1200).map(band => band.color);
const uniformTitle = ["#FFFFFF", "#000000"].find(fg => titleColors.every(color => contrast(color, fg) >= 3));
const seasonId = sha256(toUtf8Bytes(`manekineko:seasons.json:chain:1:season:${season.season}`));
const linework = buildTinctaLinework(seasonId, collection.color, 0);
const seasonLinework = buildTinctaLinework(seasonId, season.collections[0], 0);
async function motifTransform(paths) {
  const specimen = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><g fill="none" stroke="#111111" stroke-width="1">${paths}</g></svg>`;
  const { info } = await sharp(Buffer.from(specimen)).trim().png().toBuffer({ resolveWithObject: true });
  const scale = Math.min(2.2, 650 / info.width, 392 / info.height);
  const centerX = -info.trimOffsetLeft + info.width / 2;
  const centerY = -info.trimOffsetTop + info.height / 2;
  return `translate(1190 348) scale(${scale}) translate(${-centerX} ${-centerY})`;
}
const collectionTransform = await motifTransform(linework);
const seasonTransform = await motifTransform(seasonLinework);
const results = [];
await mkdir(output, { recursive: true });

for (const template of templates) {
  const post = substitute(template.post);
  const replies = template.replies.map(reply => substitute(reply));
  for (const text of [post, ...replies]) {
    if ([...text].length > 280) throw new Error(`Shorten ${template.id}: review text exceeds 280 code points. X weighted validation remains a publisher responsibility.`);
  }
  if (template.id === "upcoming-season") {
    const stem = `upcoming-season-${pad(season.season)}`;
    // Preserve the previously approved image byte-for-byte. A different season
    // can be rendered separately with render-season-announcement.mjs.
    try {
      await access(resolve(source, `${stem}.png`));
      if (output !== source) for (const extension of ["png", "svg", "json"]) await copyFile(resolve(source, `${stem}.${extension}`), resolve(output, `${stem}.${extension}`));
      results.push({ id: template.id, label: template.label, stem, post, replies, repeatReplies: [], approved: season.season === 1 });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    continue;
  }
  const stats = template.layout === "statistics";
  const lines = template.headline.map(value => substitute(value));
  const headingSizes = await Promise.all(lines.map((line, index) => fitted(line, stats ? 122 : 134, index === 0 ? 738 : 1030)));
  const seasonSize = await fitted(season.theme, stats ? 36 : 26, 736, 400, -0.4);
  const collectionSize = await fitted(collection.name, 42, 736, 500, -1);
  const footer = substitute(template.footer);
  const footerSize = await fitted(footer, 23, 1200, 400, -0.4);
  const detail = template.detail ? substitute(template.detail) : null;
  const detailSize = detail ? await fitted(detail, 20, 1320, 400, 0.3, true) : 0;
  const metrics = stats ? await Promise.all(template.metrics.map(async metric => {
    const value = substitute(metric.value);
    const label = metric.label;
    return { value, label, valueSize: await fitted(value, 44, 286, 500, -1), labelSize: await fitted(label, 16, 286, 400, 0.3, true) };
  })) : [];
  const title = `Tincta — ${template.label} — Season ${fields.seasonNumber}${stats ? "" : `, ${collection.name}`}`;
  const alt = `${title}. ${lines.join(" ")}${detail ? ` ${detail}.` : ""}${stats ? ` ${metrics.map(metric => `${metric.label}: ${metric.value}`).join("; ")}.` : ""} Design preview with fictional event data.`;
  const palette = bands.map(band => `<g clip-path="url(#band-${band.index})">
    <rect x="${band.x}" y="132" width="${band.width}" height="640" fill="${band.color}"/>
    <g transform="${stats ? seasonTransform : collectionTransform}" fill="none" stroke="${band.foreground}" stroke-width="0.8" opacity="0.48">${stats ? seasonLinework : linework}</g>
    <g fill="${band.foreground}">
      <text x="104" y="211" class="mono" font-size="23" letter-spacing="2">SEASON ${fields.seasonNumber}${stats ? "" : ` / COLLECTION ${fields.collectionNumber}`}</text>
      <text x="104" y="${stats ? 276 : 258}" font-size="${seasonSize}" letter-spacing="-0.4">${xml(season.theme)}</text>
      ${stats ? "" : `<text x="104" y="311" font-size="${collectionSize}" font-weight="500" letter-spacing="-1">${xml(collection.name)}</text>`}
      ${detail ? `<text x="104" y="700" class="mono" font-size="${detailSize}" letter-spacing="0.3">${xml(detail)}</text>` : ""}
      ${metrics.map((metric, index) => `<text x="${104 + index * 366}" y="664" font-size="${metric.valueSize}" font-weight="500" letter-spacing="-1">${xml(metric.value)}</text><text x="${104 + index * 366}" y="702" class="mono" font-size="${metric.labelSize}" letter-spacing="0.3">${xml(metric.label)}</text>`).join("")}
      <text x="${band.x + band.width / 2}" y="740" text-anchor="middle" class="mono" font-size="17" letter-spacing="1" opacity="0.8">${pad(band.index + 1)}</text>
      ${!stats && band.index === data.collectionNumber - 1 ? `<path d="M${band.x + band.width / 2 - 15} 750h30" stroke="${band.foreground}" stroke-width="2"/>` : ""}
    </g>
    <g fill="${uniformTitle ?? band.foreground}">${lines.map((line, index) => `<text x="104" y="${stats ? 438 + index * 136 : 506 + index * 142}" font-size="${headingSizes[index]}" font-weight="500" letter-spacing="-4">${xml(line)}</text>`).join("")}</g>
  </g>`).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title description">
    <title id="title">${xml(title)}</title><desc id="description">${xml(alt)}</desc>
    <defs>${bands.map(band => `<clipPath id="band-${band.index}"><rect x="${band.x}" y="132" width="${band.width}" height="640"/></clipPath>`).join("")}</defs>
    ${css}<rect width="1600" height="900" fill="#FFFFFF"/>
    <text x="48" y="88" fill="#111111" font-size="49" font-weight="600" letter-spacing="-3">Tincta</text>
    <text x="1552" y="82" text-anchor="end" fill="#111111" class="mono" font-size="20" letter-spacing="2">${xml(template.header)}</text>
    <text x="1552" y="111" text-anchor="end" fill="#71717A" class="mono" font-size="12" letter-spacing="1">DESIGN PREVIEW · SAMPLE DATA</text>
    ${palette}
    <text x="48" y="847" fill="#111111" font-size="${footerSize}" letter-spacing="-0.4">${xml(footer)}</text>
    <text x="1552" y="847" text-anchor="end" fill="#111111" class="mono" font-size="21">tincta.xyz</text>
  </svg>\n`;
  const stem = `${template.id}-season-${fields.seasonNumber}${stats ? "" : `-collection-${fields.collectionNumber}`}`;
  const metadata = {
    status: "design-preview", template: template.id, seasonNumber: season.season,
    seasonName: season.theme, ...(stats ? {} : { collectionNumber: data.collectionNumber, collectionName: collection.name, collectionColor: collection.color }),
    colors: season.collections, width: 1600, height: 900, alt,
    headline: lines, detail, metrics, post, replies,
    repeatReplies: template.repeatReplies ?? [], publishWhen: template.publishWhen,
  };
  await writeFile(resolve(output, `${stem}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(resolve(output, `${stem}.png`));
  await writeFile(resolve(output, `${stem}.json`), JSON.stringify(metadata, null, 2) + "\n");
  results.push({ id: template.id, label: template.label, stem, post, replies, repeatReplies: template.repeatReplies ?? [] });
}

// A review gallery keeps all image/copy pairs together without serving an app.
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tincta · Social templates</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f7f7f8;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}header,main{max-width:1424px;margin:auto;padding:40px 32px}header{padding-bottom:0}h1{font-size:42px;letter-spacing:-2px;margin:12px 0}p{line-height:1.6;color:#606068}.tag{font:12px monospace;letter-spacing:1px}nav{display:flex;flex-wrap:wrap;gap:12px 22px;margin:20px 0}a{color:inherit;text-underline-offset:4px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}article{background:#fff;border:1px solid #e8e8eb;min-width:0}article img{display:block;width:100%;height:auto}section{padding:24px}h2{font-size:20px;margin:0 0 20px}h3{font:12px monospace;text-transform:uppercase;color:#71717a;margin-top:24px}pre{font-family:inherit;font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#f7f7f8;margin:10px 0}summary{cursor:pointer;font-size:14px;padding:12px 0}footer{padding:0 24px 24px;display:flex;gap:18px;font-size:13px}article:target{outline:2px solid #111;outline-offset:6px}@media(max-width:900px){main{grid-template-columns:1fr}header,main{padding:24px 16px}h1{font-size:32px}}</style>
<header><div class="tag">TINCTA / SOCIAL SYSTEM</div><h1>A season, in every moment.</h1><p>Approved visual direction, expanded into event images and thread copy. Dates, terms, statistics and example.invalid links are placeholders. Refunds illustrate an alternative unsold outcome. No posts are published.</p><nav><a href="post-templates.md">Template guide</a><a href="post-templates.json">Template JSON</a><a href="contact-sheet.png">All images</a></nav><nav>${results.map((item, index) => `<a href="#${item.id}">${pad(index + 1)} ${xml(item.label)}</a>`).join("")}</nav></header>
<main>${results.map((item, index) => `<article id="${item.id}"><a href="${item.stem}.png"><img src="${item.stem}.png" alt="${xml(item.label)}" width="1600" height="900"></a><section><h2>${pad(index + 1)} / ${xml(item.label)}${item.approved ? " · approved" : ""}</h2><h3>Example post</h3><pre>${xml(item.post)}</pre>${item.replies.length ? `<details><summary>Thread replies</summary>${item.replies.map(reply => `<pre>${xml(reply)}</pre>`).join("")}</details>` : ""}${item.repeatReplies.length ? `<details><summary>Winner wallets and payment receipts</summary>${item.repeatReplies.map(reply => `<p>${xml(reply.when)}</p><pre>${xml(reply.text)}</pre>`).join("")}</details>` : ""}</section><footer><a href="${item.stem}.png">PNG</a><a href="${item.stem}.svg">Editable SVG</a><a href="${item.stem}.json">Metadata & copy</a></footer></article>`).join("")}</main></html>`;
await writeFile(resolve(output, "index.html"), html);
await writeFile(resolve(output, "example-posts.md"), [
  "# Tincta — example posts", "Fictional preview data and reserved example.invalid links. The refund post is an alternative outcome, not a later state of the sold-out specimen. Do not publish these examples as real protocol events.",
  ...results.map(item => `## ${item.label}\n\n${item.post}\n\n${item.replies.map((reply, index) => `### Reply ${index + 1}\n\n${reply}`).join("\n\n")}${item.repeatReplies.length ? "\n\nWinner wallet and payment-receipt reply patterns are in post-templates.json. Populate only from verified chain records." : ""}`),
].join("\n\n") + "\n");
if (output !== source) await copyFile(resolve(source, "post-templates.json"), resolve(output, "post-templates.json"));
await writeFile(resolve(output, "render-data.json"), JSON.stringify(data, null, 2) + "\n");
const templateFields = [...new Set(JSON.stringify(templates).matchAll(/\{\{([A-Za-z]+)\}\}/g).map(match => match[1]))].sort();
await writeFile(resolve(output, "post-templates.md"), [
  "# Tincta social images and post templates",
  "The approved upcoming-season image is expanded into seven event templates. Every image is 1600 × 900, with an editable SVG and metadata/alt text. The review examples use Season 01, Crimson & Blood Orange, and Collection 01, Velvet Ember. Dates, terms, figures and links are fictional placeholders. The unsold/refund branch is an alternative scenario.",
  "## Copy decisions",
  "Mint opening remains fixed: a full affiliate program does not start it earlier. Sellout makes earned affiliate commissions claimable; the draw and NFT-holder prize claims happen separately. The winners thread lists verified token IDs and holder wallets. Append payment receipts only after confirmed claims. Refunds require a holder claim, burn the NFT and exclude gas. Season totals labeled claimed use actual successful claim events, with one network/currency and a stated snapshot block.",
  "## Dynamic values",
  "The image renderer reads catalog names, ordered colors and the established motif; it does not invent season identity. Input dates are UTC. Relative countdowns in these previews use the explicit example timestamps. A future publisher must regenerate them at send time, verify eligibility/event state and resolve actual public URLs. Amounts enter as decimal strings. Full winner/claim records are intentionally absent from sample data because no live winner or payment has been verified for these designs.",
  "The JSON is an independent copy specification. It is not compatible with the existing Launch three-template parser without an adapter. It does not enable automated posting. The preview renderer checks text fitting and a preliminary 280-code-point budget for main posts and static replies. A future publisher must use X's weighted text/URL validation after all substitutions, including repeated replies, and deduplicate confirmed events.",
  "Fields: " + templateFields.map(field => `\`{{${field}}}\``).join(", ") + ".",
  ...templates.map(template => `## ${template.label}\n\nPublication condition: ${template.publishWhen}\n\n### Main post\n\n\`\`\`text\n${template.post}\n\`\`\`\n\n${template.replies.map((reply, index) => `### Reply ${index + 1}\n\n\`\`\`text\n${reply}\n\`\`\``).join("\n\n")}${(template.repeatReplies ?? []).map(reply => `\n\n### Repeat for ${reply.forEach}\n\n${reply.when}\n\n\`\`\`text\n${reply.text}\n\`\`\``).join("")}`),
].join("\n\n") + "\n");

// Export a compact contact sheet for visual comparison in the conversation.
const columns = 2, cardWidth = 800, cardHeight = 498, gap = 24, margin = 32;
const boardWidth = margin * 2 + columns * cardWidth + gap;
const boardHeight = margin * 2 + Math.ceil(results.length / columns) * cardHeight + (Math.ceil(results.length / columns) - 1) * gap;
const layers = [];
for (const [index, item] of results.entries()) {
  const left = margin + index % columns * (cardWidth + gap);
  const top = margin + Math.floor(index / columns) * (cardHeight + gap);
  layers.push({ input: await sharp(resolve(output, `${item.stem}.png`)).resize(cardWidth, 450).png().toBuffer(), left, top });
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="48">${css}<rect width="800" height="48" fill="#FFFFFF"/><text x="24" y="30" font-size="17" fill="#111111">${pad(index + 1)} / ${xml(item.label)}</text></svg>`;
  layers.push({ input: Buffer.from(label), left, top: top + 450 });
}
await sharp({ create: { width: boardWidth, height: boardHeight, channels: 3, background: "#EFEFF1" } }).composite(layers).png().toFile(resolve(output, "contact-sheet.png"));
console.log(JSON.stringify({ directory: output, newImages: results.filter(item => !item.approved).length, galleryImages: results.length, maxExamplePostCodePoints: Math.max(...results.flatMap(item => [item.post, ...item.replies]).map(text => [...text].length)) }));
