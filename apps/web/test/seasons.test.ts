import assert from "node:assert/strict";
import test from "node:test";
import { sha256, toUtf8Bytes } from "ethers";
import { readFileSync } from "node:fs";
import type { CollectionPublic } from "../lib/collections/model.ts";
import { collectionAvailabilityLabel, groupSeasons, isCollectionLive, isSeasonId, mintDestination, currentLiveCollection, seasonHref } from "../lib/seasons/model.ts";
import { collectionPrizeCopy, collectionReferralCopy } from "../lib/collections/copy.ts";
import { paletteForSeason, seasonColors, upcomingCollectionColors, upcomingSeasonPalettes } from "../lib/seasons/palettes.ts";

const catalog = JSON.parse(readFileSync(new URL("../lib/collections/catalog.json", import.meta.url), "utf8"));
const now = Date.parse("2026-09-20T12:00:00Z");
const identity = (ordinal: number, chain = 1) => sha256(toUtf8Bytes(`manekineko:seasons.json:chain:${chain}:season:${ordinal}`));
function collection(overrides: Partial<CollectionPublic> = {}): CollectionPublic {
  return { ...catalog.collections[0], ...catalog.network, id:"123e4567-e89b-42d3-a456-426614174000", seriesId:catalog.series.id,
    seasonId:identity(1),seasonName:"Crimson & Blood Orange",collectionColor:"#330000",textColor:"#FFFFFF",roundId:"1",chainId:1,
    contractVersion:"affiliate-v8",algorithmVersion:"unique-rank-v5",winnerCount:6,prizeBps:6000,affiliatePoolBps:2000,minAffiliateReferrals:100,
    nativeCurrency:{symbol:"ETH",decimals:18},contractStatus:"deployed",contractAddress:"0x"+"1".repeat(40),mode:"live",source:"postgres",
    phase:"minting",saleStartAt:"2026-09-20T10:00:00Z",mintDeadline:"2026-09-21T10:00:00Z",totalMinted:40,maxSupply:1000,
    mintPriceWei:"10000000000000000",updatedAt:"2026-09-20T11:59:00Z",...overrides };
}

test("mint entry selects a live season and anchors its open collection", () => {
  const live = collection();
  assert.equal(mintDestination([live], now), `${seasonHref({id:live.seasonId!,chainId:1})}#collection-${live.id}`);
});

test("no real mintable season falls back to the seasons page", () => {
  for (const changes of [
    {phase:"complete"}, {phase:"pending_activation"}, {phase:"awaiting_randomness"}, {phase:"refundable"},
    {totalMinted:1000}, {saleStartAt:"2026-09-20T12:00:01Z"}, {mintDeadline:"2026-09-20T12:00:00Z"},
    {mintDeadline:null}, {saleStartAt:"bad-date"}, {contractStatus:"undeployed"}, {contractAddress:null}, {mode:"demo"},
    {seasonId:null,seasonName:null}, {seasonName:null},
  ] as Partial<CollectionPublic>[]) assert.equal(mintDestination([collection(changes)], now), "/seasons", JSON.stringify(changes));
  assert.equal(mintDestination([], now), "/seasons");
  assert.equal(isCollectionLive(collection({saleStartAt:"2026-09-20T12:00:00Z"}), now), true);
});

test("overlapping live collections select deterministically without using snapshot update times", () => {
  const first = collection({id:"123e4567-e89b-42d3-a456-426614174001",updatedAt:"2026-09-20T12:00:00Z"});
  const latest = collection({id:"123e4567-e89b-42d3-a456-426614174002",roundId:"2",saleStartAt:"2026-09-20T11:00:00Z"});
  assert.equal(currentLiveCollection([latest, first], now)?.id,latest.id);
  assert.equal(currentLiveCollection([first, latest], now)?.id,latest.id);
  assert.equal(currentLiveCollection([first, {...latest,totalMinted:1000}], now)?.id,first.id);
});

test("season grouping uses immutable identity plus chain, not name, and excludes unpublished records", () => {
  const first=collection();
  const grouped=groupSeasons([first,collection({id:"second",roundId:"2",seasonId:first.seasonId!.toUpperCase().replace("0X","0x")}),collection({id:"other-chain",chainId:11155111}),collection({id:"private-draft",mode:"demo",contractStatus:"undeployed"}),collection({id:"legacy",seasonId:null,seasonName:null})]);
  assert.equal(grouped.length,2);
  assert.deepEqual(grouped.find(s=>s.chainId===1)?.collections.map(c=>c.id),[first.id,"second"]);
  assert.equal(grouped.find(s=>s.chainId===11155111)?.collections.length,1);
  assert.notEqual(seasonHref(grouped[0]),seasonHref(grouped[1]));
});

test("saved catalog order and numeric collection order are retained", () => {
  const grouped=groupSeasons([collection({seasonId:identity(2),seasonName:"Second season"}),collection({roundId:"10",id:"ten"}),collection({roundId:"2",id:"two"})]);
  assert.equal(grouped[0].id,identity(1));
  assert.deepEqual(grouped[0].collections.map(c=>c.roundId),["2","10"]);
  assert.equal(grouped[1].id,identity(2));
  assert.deepEqual(groupSeasons([collection({seasonName:"Renamed season"})]).map(s=>s.id),[identity(1)]);
});

test("season ids reject invalid paths and zero identities", () => {
  for (const id of ["../mint","0x"+"0".repeat(64),"0x1234",""]) assert.equal(isSeasonId(id),false);
  assert.equal(isSeasonId(identity(1)),true);
});

test("prize and affiliate descriptions use configured economics, including older versions", () => {
  assert.equal(collectionPrizeCopy(collection()),"6 winning tickets · 1 ETH each at sellout");
  assert.equal(collectionPrizeCopy(collection({winnerCount:3})),"3 winning tickets · 2 ETH each at sellout");
  assert.equal(collectionPrizeCopy(collection({contractVersion:"affiliate-v7",winnerCount:null})),"2 winning tickets · Ranked prizes");
  assert.equal(collectionPrizeCopy(collection({contractVersion:"affiliate-v5",winnerCount:null})),"1 winning ticket · Original collection rules");
  assert.match(collectionReferralCopy(collection()),/100 paid referrals/);
  assert.match(collectionReferralCopy(collection()),/equally at sellout/);
  assert.throws(()=>collectionPrizeCopy(collection({winnerCount:null})));
});

test("collection cards never label closed, scheduled or sold-out mints as open", () => {
  assert.equal(collectionAvailabilityLabel(collection({mintDeadline:"2026-09-20T12:00:00Z"}),now),"Mint closed");
  assert.equal(collectionAvailabilityLabel(collection({saleStartAt:"2026-09-20T13:00:00Z"}),now),"Scheduled");
  assert.equal(collectionAvailabilityLabel(collection({totalMinted:1000}),now),"Sold out");
});

test("season teasers retain catalog colors and order without exposing unpublished names", () => {
  const [season] = groupSeasons([collection()]);
  assert.deepEqual(seasonColors(season), ["#330000", "#660000", "#990000", "#CC0000", "#FF0000", "#663300", "#993300", "#CC3300", "#FF3300", "#FF6600"]);
  assert.deepEqual(upcomingCollectionColors(season), [{ ordinal: 2, color: "#660000" }, { ordinal: 3, color: "#990000" }]);
  const next = upcomingSeasonPalettes([season]);
  assert.deepEqual(next.map(p => p.ordinal), [2, 3]);
  assert(next.every(p => Object.keys(p).join(",") === "ordinal,colors"));
});

test("fictionally named test seasons use their matching palette without changing their identity", () => {
  const [season] = groupSeasons([collection({ seasonId: "0x" + "42".repeat(32), seasonName: "Aster Vale", name: "Cinder Study" })]);
  assert.equal(paletteForSeason(season)?.ordinal, 1);
  assert.equal(season.name, "Aster Vale");
  assert.equal(seasonColors(season).length, 10);
  const unknown = { ...season, collections: [collection({ collectionColor: "#123456" })] };
  assert.equal(paletteForSeason(unknown), null);
  assert.deepEqual(upcomingCollectionColors(unknown), []);
});

test("published colors are not repeated as teasers and the catalog ends without wrapping", () => {
  const [season] = groupSeasons([collection(), collection({ id: "second", roundId: "2", collectionColor: "#660000" })]);
  assert.deepEqual(upcomingCollectionColors(season).map(c => c.ordinal), [3, 4]);
  const [last] = groupSeasons([collection({ seasonId: identity(22), collectionColor: "#FFFFFF" })]);
  assert.equal(seasonColors(last).length, 6);
  assert.deepEqual(upcomingCollectionColors(last), []);
  assert.deepEqual(upcomingSeasonPalettes([last]), []);
});
