import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { sha256, toUtf8Bytes } from "ethers";
import { buildTinctaPermanentSvg } from "../packages/contracts/src/tincta-artwork.ts";
import { encodePermanentCombination } from "../packages/contracts/src/permanent-combinations.ts";
import { contrastTextColor } from "../packages/contracts/src/season-appearance.ts";

// Fictional, deterministic previews of one collection; never deployed metadata.
const check = process.argv.includes("--check");
const root = new URL("../", import.meta.url);
const directory = new URL("apps/landing-page/public/artwork/rewards-machine/", root);
const catalog = JSON.parse(await readFile(new URL("seasons.json", root), "utf8"));
const color = catalog.find((season) => season.season === 11).collections[2];
const key = sha256(toUtf8Bytes("tincta:landing:illustrative-permanent-numbers:v10"));
const seasonId = sha256(toUtf8Bytes("manekineko:seasons.json:chain:1:season:11"));
const manifest = [];
if (!check) await mkdir(directory, { recursive: true });
async function save(file, content) {
  if (check) assert.equal(await readFile(file, "utf8"), content, `${file.pathname} needs regeneration`);
  else await writeFile(file, content);
}
for (const tokenId of [42, 128, 256, 384, 512, 640]) {
  const { numbers, combinationCode } = encodePermanentCombination(tokenId, key);
  const svg = buildTinctaPermanentSvg({ seasonId, seasonName: "Season 11", collectionName: "Collection 03", collectionColor: color, textColor: contrastTextColor(color), tokenId, numbers, combinationCode });
  assert.ok(!/<(?:image|script|foreignObject)\b|\b(?:href|onload)=/.test(svg));
  assert.ok(!svg.includes("SCORE") && !svg.includes("WINNING EDITION"));
  await save(new URL(`nft-${tokenId}.svg`, directory), svg);
  manifest.push({ tokenId, numbers, image: `/artwork/rewards-machine/nft-${tokenId}.svg` });
}
await save(new URL("apps/landing-page/components/rewards-machine-artwork.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${check ? "Verified" : "Generated"} six Rewards machine illustration assets.`);
