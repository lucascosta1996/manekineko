import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { sha256, toUtf8Bytes } from "ethers";
import { buildTinctaPermanentSvg } from "../packages/contracts/src/tincta-artwork.ts";
import { contrastTextColor } from "../packages/contracts/src/season-appearance.ts";
import { encodePermanentCombination } from "../packages/contracts/src/permanent-combinations.ts";

// Public design previews, not deployed or minted NFTs. Keep unpublished catalog
// names out of these assets. The fixed demonstration key is not a draw seed.
// Run: node --import tsx scripts/generate-landing-artwork.mjs [--check]
const checking = process.argv.includes("--check");
const catalog = JSON.parse(
  await readFile(new URL("../seasons.json", import.meta.url), "utf8")
);
const output = new URL("../apps/landing-page/public/artwork/", import.meta.url);
const manifestFile = new URL(
  "../apps/landing-page/app/artwork.json",
  import.meta.url
);
const demonstrationKey = sha256(
  toUtf8Bytes("tincta:landing:illustrative-permanent-numbers:v10")
);
const pad = (value) => String(value).padStart(2, "0");
const selections = [
  { season: 1, collection: 10, tokenId: 42 },
  { season: 6, collection: 9, tokenId: 128 },
  { season: 11, collection: 3, tokenId: 256 },
  { season: 14, collection: 5, tokenId: 384 },
  { season: 16, collection: 10, tokenId: 512 },
  { season: 20, collection: 8, tokenId: 640 },
];

if (!checking) await mkdir(output, { recursive: true });
const manifest = [];
for (const selection of selections) {
  const season = catalog.find((entry) => entry.season === selection.season);
  assert.ok(season, "The selected season must exist in the catalog.");
  const color = season.collections[selection.collection - 1];
  assert.match(color, /^#[0-9A-F]{6}$/, "Use an exact catalog hex color.");
  // This is the canonical catalog convention already used by the artwork
  // preview generator; the renderer preserves its corresponding motif.
  const seasonId = sha256(
    toUtf8Bytes(`manekineko:seasons.json:chain:1:season:${selection.season}`)
  );
  const { numbers, combinationCode } = encodePermanentCombination(
    selection.tokenId,
    demonstrationKey
  );
  const svg = buildTinctaPermanentSvg({
    seasonId,
    seasonName: `Season ${pad(selection.season)}`,
    collectionName: `Collection ${pad(selection.collection)}`,
    collectionColor: color,
    textColor: contrastTextColor(color),
    tokenId: selection.tokenId,
    numbers,
    combinationCode,
  });
  assert.ok(
    !/<(?:image|script|foreignObject)\b|\b(?:href|onload)=/.test(svg),
    "Previews must remain self-contained passive SVG."
  );
  assert.ok(
    !svg.includes("SCORE") && !svg.includes("WINNING EDITION"),
    "Permanent metadata cannot imply a draw result."
  );
  const filename = `season-${pad(selection.season)}-collection-${pad(
    selection.collection
  )}.svg`;
  if (checking)
    assert.equal(
      await readFile(new URL(filename, output), "utf8"),
      svg,
      `${filename} needs regeneration.`
    );
  else await writeFile(new URL(filename, output), svg);
  manifest.push({ file: `/artwork/${filename}`, color, ...selection });
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
if (checking)
  assert.equal(
    await readFile(manifestFile, "utf8"),
    manifestJson,
    "The artwork manifest needs regeneration."
  );
else await writeFile(manifestFile, manifestJson);
console.log(
  `${checking ? "Verified" : "Generated"} ${
    manifest.length
  } permanent SVG design previews and the public artwork manifest.`
);
