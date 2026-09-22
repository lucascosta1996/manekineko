import { expect } from "chai";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { artifacts, network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

// Use the real browser-safe generator and metadata reader without importing the web
// project's bundler-only TypeScript settings into Hardhat's NodeNext project.
const artworkUrl = new URL("../../../packages/contracts/src/tincta-artwork.ts", import.meta.url).href;
const metadataUrl = new URL("../../web/lib/nfts/metadata.ts", import.meta.url).href;
const appearanceUrl = new URL("../../../packages/contracts/src/season-appearance.ts", import.meta.url).href;
const motifsUrl = new URL("../../../packages/contracts/src/tincta-motifs.ts", import.meta.url).href;
const { buildTinctaSvg, TINCTA_ARTWORK_VERSION } = await import(artworkUrl);
const { decodeOnChainMetadata, validateOnChainSvg, verifyMetadataNumbers } = await import(metadataUrl);
const { contrastTextColor } = await import(appearanceUrl);
const { getTinctaMotif } = await import(motifsUrl);
const catalog: { season: number; theme: string; collections: string[] }[] = JSON.parse(
  await readFile(new URL("../../../seasons.json", import.meta.url), "utf8"),
);

// Reproduce the importer identity, not a test-only list that can drift from the
// seasons users actually configure. The two supported networks have separate IDs.
function catalogAppearance(season: typeof catalog[number], color: string, chainId: number): Appearance {
  return {
    seasonId: `0x${createHash("sha256").update(`manekineko:seasons.json:chain:${chainId}:season:${season.season}`).digest("hex")}`,
    seasonName: season.theme, collectionName: color, collectionColor: color, textColor: contrastTextColor(color),
  };
}
function geometry(svg: string) {
  const paths = Array.from(svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g), match => match[1]);
  expect(paths.length).to.be.greaterThan(1);
  return paths.join("|");
}
function preview(appearance: Appearance, value: RenderCase = cases[0]) {
  return buildTinctaSvg({ ...appearance, tokenId: value.tokenId, state: value.state,
    ...(value.revealed ? { numbers: value.numbers, score: value.score, awardRank: value.awardRank } : {}) });
}

const seasonId = ethers.id("Tincta artwork test");
const appearances = [
  { seasonId, seasonName: "Crimson & Blood Orange", collectionName: "#330000", collectionColor: "#330000", textColor: "#FFFFFF" },
  { seasonId, seasonName: "Crimson & Blood Orange", collectionName: "#FF6600", collectionColor: "#FF6600", textColor: "#000000" },
  { seasonId, seasonName: 'Season <"Sun"> & \'Moon\'', collectionName: 'Collection <"Light"> & \'Shade\'', collectionColor: "#FFFFFF", textColor: "#000000" },
  { seasonId, seasonName: "S".repeat(64), collectionName: "C".repeat(80), collectionColor: "#330000", textColor: "#FFFFFF" },
  { seasonId, seasonName: "春".repeat(21) + "S", collectionName: "月".repeat(26) + "AB", collectionColor: "#FFFFFF", textColor: "#000000" },
];
type Appearance = typeof appearances[number];
const cases = [
  { state: "sealed", refundable: false, revealed: false, tokenId: 1n, numbers: [0, 0, 0, 0], score: 0n, awardRank: 0, awardAmount: 0n },
  { state: "refundable", refundable: true, revealed: false, tokenId: 42n, numbers: [0, 0, 0, 0], score: 0n, awardRank: 0, awardAmount: 0n },
  { state: "revealed", refundable: false, revealed: true, tokenId: 999n, numbers: [9, 5, 12, 3], score: 997n, awardRank: 0, awardAmount: 0n },
  { state: "revealed", refundable: false, revealed: true, tokenId: 65536n, numbers: [16, 16, 16, 16], score: 65536n, awardRank: 6, awardAmount: ethers.parseEther("1") },
] as const;
type RenderCase = typeof cases[number];
function args(appearance: Appearance, value: RenderCase) {
  const numbers: [number, number, number, number] = [...value.numbers];
  return [appearance, value.tokenId, value.refundable, value.revealed, numbers, value.score, value.awardRank, value.awardAmount] as const;
}
function decode(uri: string) {
  expect(uri).to.match(/^data:application\/json;base64,[A-Za-z0-9+/]+=*$/);
  const raw = Buffer.from(uri.split(",")[1], "base64");
  expect(raw.toString("base64")).to.equal(uri.split(",")[1]);
  const metadata = JSON.parse(raw.toString("utf8"));
  expect(metadata.image).to.match(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/);
  const svgBytes = Buffer.from(metadata.image.split(",")[1], "base64");
  expect(svgBytes.toString("base64")).to.equal(metadata.image.split(",")[1]);
  return { metadata, svg: svgBytes.toString("utf8"), svgBytes };
}
async function fixture() {
  return { renderer: await ethers.deployContract("ManekinekoRendererV8") };
}

describe("Tincta V8 immutable SVG artwork", function () {
  this.timeout(120_000);

  it("matches the shared preview byte-for-byte for lifecycle states, winners, colors and escaped UTF-8 names", async () => {
    const { renderer } = await networkHelpers.loadFixture(fixture);
    for (const appearance of appearances) {
      await renderer.validateAppearance(appearance.seasonName, appearance.collectionName, appearance.collectionColor, appearance.textColor);
      for (const value of cases) {
        const uri = await renderer.tokenURI(...args(appearance, value));
        const { metadata, svg, svgBytes } = decode(uri);
        expect(svg).to.equal(buildTinctaSvg({ ...appearance, tokenId: value.tokenId, state: value.state,
          ...(value.revealed ? { numbers: value.numbers, score: value.score, awardRank: value.awardRank } : {}) }));
        expect(svg).to.contain('width="640" height="800" viewBox="0 0 640 800"').and.contain("TINCTA");
        expect(svgBytes.length).to.be.lessThan(16 * 1024);
        expect(svg).not.to.match(/<(?:script|image|foreignObject|use|style)|(?:href|onload|style|transform)=|url\(/i);
        validateOnChainSvg(svg);
        expect(metadata.artwork_version).to.equal(TINCTA_ARTWORK_VERSION);
        expect(metadata.contract_version).to.equal("affiliate-v8");
        expect(metadata.algorithm_version).to.equal("unique-rank-v5");
        expect(metadata.season_id).to.equal(seasonId);
        expect(metadata.season_name).to.equal(appearance.seasonName);
        expect(metadata.collection_name).to.equal(appearance.collectionName);
        expect(metadata.name).to.equal(`${appearance.collectionName} #${value.tokenId}`);
        expect(metadata.background_color).to.equal(appearance.collectionColor.slice(1));
        expect(metadata.text_color).to.equal(appearance.textColor);
        expect(metadata.award_rank).to.equal(value.awardRank);
        expect(metadata.prize_amount_wei).to.equal(value.awardAmount.toString());

        const decoded = decodeOnChainMetadata(uri, "affiliate-v8");
        if (value.revealed) {
          const [a, b, c, d] = value.numbers;
          const code = (a - 1) * 4096 + (b - 1) * 256 + (c - 1) * 16 + d - 1;
          expect(metadata.attributes).to.deep.equal([
            ...value.numbers.map((value, index) => ({ trait_type: "ABCD"[index], value })),
            { trait_type: "Combination code", value: code }, { trait_type: "Score", value: Number(value.score) },
          ]);
          expect(verifyMetadataNumbers(decoded, true, [value.numbers.map(BigInt), BigInt(code), value.score], 65536,
            { contractVersion: "affiliate-v8", decodedScore: value.score })).to.deep.equal({ numbers: [...value.numbers], score: value.score.toString() });
        } else {
          expect(metadata.attributes).to.deep.equal([{ trait_type: "Status", value: value.refundable ? "Refundable" : "Sealed" }]);
          expect(verifyMetadataNumbers(decoded, false, null, 65536, { contractVersion: "affiliate-v8" })).to.deep.equal({ numbers: null, score: null });
          expect(svg).not.to.contain("WINNING EDITION");
        }
      }
    }
  });

  it("preserves square V7 artwork and its existing metadata identity", async () => {
    const renderer = await ethers.deployContract("ManekinekoRendererV7");
    for (const value of [cases[0], cases[2]]) {
      const uri = await renderer.tokenURI(...args(appearances[0], value));
      const { metadata, svg } = decode(uri);
      expect(svg).to.contain('width="640" height="640" viewBox="0 0 640 640"');
      expect(svg).not.to.contain("TINCTA").and.not.to.contain("<path");
      expect(metadata.contract_version).to.equal("affiliate-v7");
      expect(metadata.algorithm_version).to.equal("unique-rank-v4");
      expect(metadata.artwork_version).to.equal(undefined);
      decodeOnChainMetadata(uri, "affiliate-v7");
    }
  });

  it("gives every catalog season its intended distinct motif even when color, names and token are held constant", async () => {
    const { renderer } = await networkHelpers.loadFixture(fixture);
    const mainnetShapes = new Map<number, string>();
    for (const chainId of [1, 11155111]) {
      const shapes = new Set<string>();
      for (const season of catalog) {
        const appearance = { ...catalogAppearance(season, "#330000", chainId), seasonName: "Same name", collectionName: "Same collection" };
        expect(getTinctaMotif(appearance.seasonId)).to.equal(season.season - 1);
        expect(await renderer.artworkMotif(appearance.seasonId)).to.equal(BigInt(season.season - 1));
        const paths = geometry(preview(appearance));
        expect(shapes.has(paths), `season ${season.season} on chain ${chainId} reused a season geometry`).to.equal(false);
        shapes.add(paths);
        if (chainId === 1) mainnetShapes.set(season.season, paths);
        else expect(paths, `season ${season.season} changed geometry between staging and mainnet`).to.equal(mainnetShapes.get(season.season));
        // Display copy does not choose or change the season's motif.
        expect(geometry(preview({ ...appearance, seasonName: season.theme, collectionName: "Renamed collection" }))).to.equal(paths);
      }
      expect(shapes.size).to.equal(catalog.length);
    }
  });

  it("uses the same deterministic custom-season fallback on-chain and in previews", async () => {
    const { renderer } = await networkHelpers.loadFixture(fixture);
    for (const identity of [seasonId, ethers.id("A custom season"), `0x${"ff".repeat(32)}`]) {
      const motif = getTinctaMotif(identity);
      expect(await renderer.artworkMotif(identity)).to.equal(BigInt(motif));
      expect(getTinctaMotif(`0x${identity.slice(2).toUpperCase()}`)).to.equal(motif);
    }
    for (const identity of ["", "season-1", "0x12", `0x${"0".repeat(64)}`, `0x${"gg".repeat(32)}`]) {
      expect(() => preview({ ...appearances[0], seasonId: identity })).to.throw("Invalid artwork season ID");
    }
  });

  it("matches on-chain artwork for every catalog color and varies collection geometry without relying on fill or labels", async () => {
    const { renderer } = await networkHelpers.loadFixture(fixture);
    for (const chainId of [1, 11155111]) {
      for (const season of catalog) {
        const shapes = new Set<string>();
        for (const color of season.collections) {
          const appearance = catalogAppearance(season, color, chainId);
          const expected = preview(appearance);
          const { svg, svgBytes } = decode(await renderer.tokenURI(...args(appearance, cases[0])));
          expect(svg, `season ${season.season} / ${color} / chain ${chainId}`).to.equal(expected);
          validateOnChainSvg(svg);
          expect(svgBytes.length).to.be.lessThan(16 * 1024);
          const paths = geometry(svg);
          expect(shapes.has(paths), `season ${season.season} reused a collection geometry at ${color}`).to.equal(false);
          shapes.add(paths);
        }
        expect(shapes.size).to.equal(season.collections.length);
      }
    }
  });

  it("keeps every season's largest catalog artwork inside the RPC gas and response budgets", async () => {
    const { renderer } = await networkHelpers.loadFixture(fixture);
    for (const chainId of [1, 11155111]) {
      for (const season of catalog) {
        // Exercise maximum name escaping and the fullest winner display for each
        // season. The longest collection geometry is chosen independently in JS.
        const candidates = season.collections.map(color => ({ ...catalogAppearance(season, color, chainId),
          seasonName: '"'.repeat(64), collectionName: '"'.repeat(80) }));
        const appearance = candidates.reduce((largest, next) =>
          Buffer.byteLength(preview(next, cases[3])) > Buffer.byteLength(preview(largest, cases[3])) ? next : largest);
        const estimate = await renderer.tokenURI.estimateGas(...args(appearance, cases[3]));
        expect(estimate, `season ${season.season} / chain ${chainId}`).to.be.lessThan(3_000_000n);
        const uri = await renderer.tokenURI(...args(appearance, cases[3]), { gasLimit: 3_000_000 });
        const { svg, svgBytes } = decode(uri);
        expect(svg).to.equal(preview(appearance, cases[3]));
        expect(svgBytes.length).to.be.lessThan(16 * 1024);
        expect(Buffer.byteLength(uri, "utf8")).to.be.lessThan(48 * 1024);
      }
    }
  });

  it("keeps tokenURI within the RPC gas and response-size budgets", async () => {
    const { renderer } = await networkHelpers.loadFixture(fixture);
    // Long XML names exercise the largest escaping expansion, while max token/score
    // values exercise the longest numeric labels. This is a read-only RPC gas budget.
    const appearance = { ...appearances[0], seasonName: '"'.repeat(64), collectionName: '"'.repeat(80) };
    for (const value of cases) {
      const estimate = await renderer.tokenURI.estimateGas(...args(appearance, value));
      expect(estimate).to.be.lessThan(3_000_000n);
      const uri = await renderer.tokenURI(...args(appearance, value), { gasLimit: 3_000_000 });
      const { svgBytes } = decode(uri);
      expect(svgBytes.length).to.be.lessThan(16 * 1024);
      expect(Buffer.byteLength(uri, "utf8")).to.be.lessThan(48 * 1024);
    }
  });

  it("keeps renderer and factory code within EIP-170 and EIP-3860 deployment limits", async () => {
    for (const component of ["ManekinekoRendererV8", "ManekinekoFactoryV8"]) {
      const artifact = await artifacts.readArtifact(component);
      expect((artifact.deployedBytecode.length - 2) / 2, `${component} runtime`).to.be.at.most(24_576);
      const factory = await ethers.getContractFactory(component);
      const deploy = component === "ManekinekoFactoryV8"
        ? await factory.getDeployTransaction((await ethers.getSigners())[0].address)
        : await factory.getDeployTransaction();
      expect((deploy.data.length - 2) / 2, `${component} initcode including arguments`).to.be.at.most(49_152);
    }
  });
});
