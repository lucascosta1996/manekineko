import assert from "node:assert/strict";
import test from "node:test";
import { contrastTextColor, normalizeCollectionColor, normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import { buildTicketSvg } from "../lib/mint/preview.ts";
import { buildTinctaSvg } from "@manekineko/contract-abi/tincta-artwork";
import { previewExample, ticketDataUri } from "../lib/mint/preview.ts";
import { decodeOnChainMetadata, validateOnChainSvg, verifyMetadataNumbers } from "../lib/nfts/metadata.ts";

const appearance = { seasonId: `0x${"ab".repeat(32)}`, seasonName: 'Night & Day <2026>', collectionColor: "#003366", textColor: "#FFFFFF" as const };

test("automatic text uses the greater black/white contrast across dark and light colors", () => {
  for (const color of ["#000000", "#003366", "#660000", "#0000FF"]) assert.equal(contrastTextColor(color), "#FFFFFF");
  for (const color of ["#FFFFFF", "#FFFF00", "#00FF00", "#F6F3E9"]) assert.equal(contrastTextColor(color), "#000000");
  assert.equal(normalizeCollectionColor(" #aa22bb "), "#AA22BB");
  assert.throws(() => normalizeCollectionColor('#000" onload="alert(1)'), /six-digit/);
  assert.throws(() => normalizeSeasonAppearance({ ...appearance, textColor: "#000000" }), /contrast/);
  assert.throws(() => normalizeSeasonAppearance({ ...appearance, seasonId: `0x${"0".repeat(64)}` }), /nonzero/);
  assert.throws(() => normalizeSeasonAppearance({ ...appearance, seasonName: "猫".repeat(22) }), /UTF-8/);
  assert.throws(() => normalizeSeasonAppearance({ ...appearance, seasonName: "name\u0001" }), /control/);
});

test("season previews escape names, preserve numbers and render collection background", () => {
  const svg = buildTicketSvg("2", 1, true, "unique-rank-v3", 20, { ...appearance, name: 'Dawn "A" <script>' });
  assert.ok(svg.includes('fill="#003366"'));
  assert.ok(svg.includes('fill="#FFFFFF"'));
  assert.ok(svg.includes('Night &amp; Day &lt;2026&gt;'));
  assert.ok(svg.includes('Dawn &quot;A&quot; &lt;script&gt;'));
  assert.ok(!svg.includes('MANEKINEKO') && !svg.includes('ROUND 2'));
  assert.ok(svg.includes('SCORE 20'));
  validateOnChainSvg(svg);
  assert.ok(buildTicketSvg("2", 1).includes('MANEKINEKO'));
});

test("V8 previews use the shared portrait artwork and never declare an illustrative winner", () => {
  const terms = { ...appearance, name: 'Dawn "A" <script>' };
  const example = previewExample("unique-rank-v5", 1000);
  for (const revealed of [false, true]) {
    const svg = buildTicketSvg("2", 17, revealed, "unique-rank-v5", 1000, terms);
    assert.equal(svg, buildTinctaSvg({
      seasonId: terms.seasonId, seasonName: terms.seasonName, collectionName: terms.name,
      collectionColor: terms.collectionColor, textColor: terms.textColor, tokenId: 17,
      state: revealed ? "revealed" : "sealed",
      ...(revealed ? { numbers: example.numbers, score: example.score } : {}),
    }));
    assert.match(svg, /viewBox="0 0 640 800"/);
    assert.ok(svg.includes('Night &amp; Day &lt;2026&gt;'));
    assert.ok(svg.includes('Dawn &quot;A&quot; &lt;script&gt;'));
    assert.doesNotMatch(svg, /WINNING EDITION|Award #/);
    assert.equal(decodeURIComponent(ticketDataUri("2", 17, revealed, "unique-rank-v5", 1000, terms).split(",")[1]), svg);
    if (!revealed) assert.match(svg, />SEALED<\/text>/);
  }
  for (const version of ["unique-rank-v2", "unique-rank-v3", "unique-rank-v4"] as const) {
    const svg = buildTicketSvg("2", 17, false, version, 1000, terms);
    assert.match(svg, /viewBox="0 0 640 640"/);
    assert.doesNotMatch(svg, /TINCTA|COLOR, COLLECTED/);
  }
});

test("season metadata accepts sealed artwork without changing status/number verification", () => {
  const svg = buildTicketSvg("1", 1, false, "unique-rank-v3", 20, { ...appearance, name: "Dawn" });
  const raw = { name: "Dawn #1", description: "Season NFT", contract_version: "affiliate-v6", algorithm_version: "unique-rank-v3", randomness_provider: "chainlink-vrf-v2.5",
    season_id: appearance.seasonId, season_name: appearance.seasonName, collection_name: "Dawn", collection_color: appearance.collectionColor, text_color: appearance.textColor, background_color: "003366",
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, attributes: [{ trait_type: "Status", value: "Sealed" }] };
  const uri = (value: unknown) => `data:application/json;base64,${Buffer.from(JSON.stringify(value)).toString("base64")}`;
  const metadata = decodeOnChainMetadata(uri(raw), "affiliate-v6");
  assert.equal(metadata.seasonName, appearance.seasonName);
  assert.equal(metadata.collectionColor, "#003366");
  assert.deepEqual(verifyMetadataNumbers(metadata, false, null, 20, { contractVersion: "affiliate-v6" }), { numbers: null, score: null });
  assert.throws(() => decodeOnChainMetadata(uri({ ...raw, text_color: "#000000" }), "affiliate-v6"));
  assert.throws(() => decodeOnChainMetadata(uri({ ...raw, background_color: "FFFFFF" }), "affiliate-v6"));
});


test("long season and collection names use the renderer font sizes without unsupported SVG attributes", () => {
  for (const [seasonName, name, seasonSize, collectionSize] of [
    ["S".repeat(64), "C".repeat(80), 13, 10],
    ["猫".repeat(21), "章".repeat(26), 13, 11],
    ["New season", "Dawn", 24, 18],
  ] as const) {
    const svg = buildTicketSvg("1", 1, false, "unique-rank-v3", 20, { ...appearance, seasonName, name });
    assert.ok(svg.includes(`<text x="48" y="80" font-size="${seasonSize}">${seasonName}</text>`));
    assert.ok(svg.includes(`<text x="48" y="128" font-size="${collectionSize}">${name}</text>`));
    assert.ok(svg.includes("Sealed until VRF reveal"));
    assert.ok(!svg.includes("textLength") && !svg.includes("lengthAdjust"));
    validateOnChainSvg(svg);
    const raw = { name: `${name} #1`, description: "Season NFT", contract_version: "affiliate-v6", algorithm_version: "unique-rank-v3", randomness_provider: "chainlink-vrf-v2.5",
      season_id: appearance.seasonId, season_name: seasonName, collection_name: name, collection_color: appearance.collectionColor, text_color: appearance.textColor, background_color: "003366",
      image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, attributes: [{ trait_type: "Status", value: "Sealed" }] };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(raw)).toString("base64")}`;
    assert.equal(decodeOnChainMetadata(uri, "affiliate-v6").seasonName, seasonName);
  }
});
