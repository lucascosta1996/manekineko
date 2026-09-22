import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, toUtf8Bytes } from "ethers";
import sharp from "sharp";
import { buildTinctaLinework } from "../packages/contracts/src/tincta-motifs.ts";
import { contrastTextColor } from "../packages/contracts/src/season-appearance.ts";

// Local artwork draft only. No network, publication, or protocol event handling.
// node --import tsx scripts/render-season-announcement.mjs [season] [output-directory]
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(resolve(root, "seasons.json"), "utf8"));
const requested = Number(process.argv[2] ?? 1);
const season = catalog.find(item => item.season === requested);
if (!season) throw new Error("Choose a season number from seasons.json.");
const output = resolve(process.argv[3] ?? resolve(root, "docs/brand/tincta/social"));
const serial = String(season.season).padStart(2, "0");
const basename = resolve(output, `upcoming-season-${serial}`);
const xml = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[char]);

const width = 1600;
const height = 900;
const field = { x: 48, y: 132, width: 1504, height: 640 };
const bandWidth = field.width / season.collections.length;
const seasonId = sha256(toUtf8Bytes(`manekineko:seasons.json:chain:1:season:${season.season}`));
const linework = buildTinctaLinework(seasonId, season.collections[0], 0);
const words = season.theme.includes(" & ")
  ? [season.theme.split(" & ")[0] + " &", season.theme.split(" & ").slice(1).join(" & ")]
  : [season.theme];
// Keep the palette's names unchanged; only adjust their line breaks and size.
const headingSize = Math.min(138, Math.floor(1660 / Math.max(...words.map(word => word.length))));
const heading = words.map((line, index) => `<text x="104" y="${words.length === 1 ? 636 : 506 + index * 146}" font-size="${headingSize}" font-weight="500" letter-spacing="-5">${xml(line)}</text>`).join("");

// A single foreground is preferable for the large heading when it remains
// legible on every band it could cross. Otherwise use each band's contrast.
function contrast(color, foreground) {
  const channels = [1, 3, 5].map(offset => {
    const srgb = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return foreground === "#FFFFFF" ? 1.05 / (luminance + 0.05) : (luminance + 0.05) / 0.05;
}
const titleColors = season.collections.filter((_, index) => field.x + index * bandWidth < 1190);
const uniformHeading = ["#FFFFFF", "#000000"].find(fg => titleColors.every(color => contrast(color, fg) >= 3));
const bands = season.collections.map((color, index) => {
  const x = field.x + index * bandWidth;
  const foreground = contrastTextColor(color);
  return `<g clip-path="url(#band-${index})">
    <rect x="${x}" y="${field.y}" width="${bandWidth}" height="${field.height}" fill="${color}"/>
    <g transform="translate(1190 356) scale(2.2) translate(-320 -350)" fill="none" stroke="${foreground}" stroke-width="0.8" opacity="0.48">${linework}</g>
    <g fill="${uniformHeading ?? foreground}">${heading}</g>
    <text x="104" y="211" fill="${foreground}" class="mono" font-size="23" letter-spacing="2">SEASON ${serial}</text>
    <text x="${x + bandWidth / 2}" y="735" text-anchor="middle" fill="${foreground}" opacity="0.8" class="mono" font-size="17" letter-spacing="1">${String(index + 1).padStart(2, "0")}</text>
  </g>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Tincta — Upcoming season ${serial}: ${xml(season.theme)}</title>
  <desc id="description">Design preview. The season name is placed over its ${season.collections.length} catalog colors, in their original order, with the season's geometric linework. No launch date is announced.</desc>
  <defs>${season.collections.map((_, index) => `<clipPath id="band-${index}"><rect x="${field.x + index * bandWidth}" y="${field.y}" width="${bandWidth}" height="${field.height}"/></clipPath>`).join("")}</defs>
  <style>text { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; } .mono { font-family: "SFMono-Regular", "SF Mono", "Menlo", "Liberation Mono", monospace; }</style>
  <rect width="1600" height="900" fill="#FFFFFF"/>
  <text x="48" y="88" fill="#111111" font-size="49" font-weight="600" letter-spacing="-3">Tincta</text>
  <text x="1552" y="82" text-anchor="end" fill="#111111" class="mono" font-size="20" letter-spacing="2">UPCOMING SEASON</text>
  ${bands}
  <text x="48" y="847" fill="#111111" font-size="24" letter-spacing="-0.5">Color, collected.</text>
  <text x="1552" y="847" text-anchor="end" fill="#111111" class="mono" font-size="21">tincta.xyz</text>
</svg>\n`;

await mkdir(dirname(basename), { recursive: true });
await writeFile(`${basename}.svg`, svg);
await sharp(Buffer.from(svg)).png().toFile(`${basename}.png`);
await writeFile(`${basename}.json`, JSON.stringify({
  status: "design-preview",
  template: "upcoming-season",
  season: season.season,
  theme: season.theme,
  colors: season.collections,
  width,
  height,
  alt: `Tincta. Upcoming Season ${serial}: ${season.theme}. ${season.collections.length} vertical bands show the season palette, with its geometric linework. Color, collected.`,
}, null, 2) + "\n");
console.log(`Created ${basename}.{svg,png,json}`);
