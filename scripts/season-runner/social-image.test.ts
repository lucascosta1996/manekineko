import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { sha256, toUtf8Bytes } from "ethers";
import sharp from "sharp";
import { buildSeasonSocialMessage, SEASON_SOCIAL_EVENTS, socialTextWeight, assertSocialText, type SeasonSocialInput } from "../../packages/contracts/src/season-social.ts";
import { renderSeasonSocialSvg, renderSeasonSocialImage } from "./social-image.ts";

const fixture: SeasonSocialInput = {
  event: "collection-live", chainId: 11155111,
  season: { id: sha256(toUtf8Bytes("fictional-social-test-season")), number: 1, name: "Aster Vale", colors: ["#B7410E", "#F2A65A"] },
  collection: { id: "fixture-collection", number: 1, name: "Cinder Study", color: "#B7410E", supply: 1000, mintPriceEth: "0.01", winnerCount: 2, prizePerWinnerEth: "1" },
  now: "2026-09-21T11:00:00Z", enrollmentOpensAt: "2026-09-21T12:00:00Z", saleStartsAt: "2026-09-21T13:00:00Z", deadline: "2026-09-22T13:00:00Z",
  urls: { season: "https://tincta.xyz/seasons/11155111/aster", collection: "https://tincta.xyz/collections/cinder", affiliate: "https://tincta.xyz/affiliates/cinder", docs: "https://tincta.xyz/docs", commissions: "https://tincta.xyz/affiliates/cinder", prizeClaim: "https://tincta.xyz/collections/cinder", refund: "https://tincta.xyz/collections/cinder" },
  stats: { collectionsSoldOut: 2, nftsMinted: 2000, prizesClaimedEth: "4", affiliateClaimedEth: "2", snapshotBlock: "123456" }, drawVerified: true,
  winners: [1, 2].map(rank => ({ rank, tokenId: String(rank), awardEth: "1", holderWallet: `0x${String(rank).repeat(40)}`, holderBlock: "123456", nftUrl: `https://sepolia.etherscan.io/token/0x${"3".repeat(40)}?a=${rank}`, claimed: rank === 1 })),
  payments: [{ rank: 1, tokenId: "1", awardEth: "1", claimantWallet: `0x${"1".repeat(40)}`, recipientWallet: `0x${"2".repeat(40)}`, transactionHash: `0x${"4".repeat(64)}`, logIndex: 2 }],
};
function forEvent(event: SeasonSocialInput["event"]): SeasonSocialInput {
  return { ...structuredClone(fixture), event, now: event === "affiliate-opening-soon" ? "2026-09-21T11:00:00Z" : event === "affiliate-enrollment-open" ? "2026-09-21T12:00:00Z" : event === "refunds-available" ? "2026-09-23T13:00:00Z" : "2026-09-21T13:00:00Z" };
}
test("all eight events render real frozen terms without sample placeholders", async () => {
  for (const event of SEASON_SOCIAL_EVENTS) {
    const message = buildSeasonSocialMessage(forEvent(event));
    const image = await renderSeasonSocialImage(message);
    const metadata = await sharp(image.png).metadata();
    assert.equal(metadata.width, 1600); assert.equal(metadata.height, 900);
    assert.match(image.svg, /SEPOLIA TEST · TEST ETH/);
    assert.doesNotMatch(image.svg, /SAMPLE DATA|DESIGN PREVIEW|example\.invalid|\{\{/);
    assert.ok(image.svg.indexOf('fill="#B7410E"') < image.svg.indexOf('fill="#F2A65A"'));
    assert.ok(message.replies.every(reply => socialTextWeight(reply) <= 280));
    assert.equal(new Set(message.replyKeys).size, message.replyKeys.length);
  }
});
test("catalog seasons preserve frozen names, color order and stable identity", async () => {
  const catalog = JSON.parse(await readFile(new URL("../../seasons.json", import.meta.url), "utf8"));
  for (const season of catalog) {
    const input = forEvent("upcoming-season");
    input.chainId = 1; input.collection = undefined;
    input.season = { id: sha256(toUtf8Bytes(`manekineko:seasons.json:chain:1:season:${season.season}`)), number: season.season, name: season.theme, colors: season.collections };
    const message = buildSeasonSocialMessage(input);
    assert.equal(message.season.name, season.theme); assert.deepEqual(message.season.colors, season.collections);
    assert.doesNotMatch(renderSeasonSocialSvg(message), /SEPOLIA|DESIGN PREVIEW/);
  }
});
test("same input renders the same image and previews visibly mark their evidence boundary", async () => {
  const message = buildSeasonSocialMessage(forEvent("collection-live"));
  const a = await renderSeasonSocialImage(message), b = await renderSeasonSocialImage(message);
  assert.equal(a.sha256, b.sha256); assert.deepEqual(a.png, b.png);
  assert.match(renderSeasonSocialSvg(message, { preview: true }), /DESIGN PREVIEW/);
});
test("copy separates sellout, verified winners and confirmed claim receipts", () => {
  const pending = buildSeasonSocialMessage({ ...forEvent("collection-sold-out"), drawVerified: false });
  assert.match(pending.post, /draw is next/); assert.doesNotMatch(pending.post, /paid|claimed/);
  const delayed = buildSeasonSocialMessage(forEvent("collection-sold-out")); assert.match(delayed.post, /draw is verified/); assert.doesNotMatch(delayed.headline.join(" "), /Draw next/);
  const winners = buildSeasonSocialMessage(forEvent("winners-revealed"));
  assert.equal(winners.replyKeys.filter(key => key.startsWith("winner:")).length, 2);
  assert.equal(winners.replyKeys.filter(key => key.startsWith("payment:")).length, 1);
  assert.match(winners.replies.at(-1)!, /sepolia\.etherscan\.io\/tx/);
  assert.match(winners.post, /claim unpaid prizes/);
  assert.match(buildSeasonSocialMessage({ ...forEvent("winners-revealed"), winners: fixture.winners!.map(w => ({ ...w, claimed: true })) }).post, /All prizes have been claimed/);
});
test("missing values, premature and stale events, duplicates, invalid links fail closed", () => {
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("affiliate-opening-soon"), now: fixture.saleStartsAt! }), /stale/);
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("collection-live"), now: fixture.now }), /sale window/);
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("winners-revealed"), winners: [] }), /Every verified/);
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("winners-revealed"), winners: [fixture.winners![0], fixture.winners![0]] }), /Inconsistent/);
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("collection-live"), urls: { collection: "https://example.invalid/mint" } }), /public HTTPS/);
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("season-complete"), stats: undefined }), /statistics/);
  assert.throws(() => buildSeasonSocialMessage({ ...forEvent("collection-live"), now: "2026-02-30T13:00:00Z" }), /Invalid UTC/);
});
test("weighted text rejects CJK overflow and counts standalone long URLs conservatively", () => {
  assert.equal(socialTextWeight("猫"), 2); assert.equal(socialTextWeight("cafe\u0301"), 4);
  assert.equal(socialTextWeight(`Receipt:\nhttps://etherscan.io/tx/0x${"a".repeat(64)}`), 32);
  assert.throws(() => assertSocialText("猫".repeat(141)), /weighted limit/);
  assert.ok(socialTextWeight("👨‍👩‍👧‍👦") >= 2);
});
