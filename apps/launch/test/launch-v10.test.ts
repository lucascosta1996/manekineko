import assert from "node:assert/strict";
import test from "node:test";
import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { decodePermanentCombination, derivePermanentCombinationKey, encodePermanentCombination } from "@manekineko/contract-abi/permanent-combinations";
import { decodeScrambledCombination, encodeScrambledRank } from "@manekineko/contract-abi/scrambled-rank";
import { buildTinctaPermanentSvg, buildTinctaSvg } from "@manekineko/contract-abi/tincta-artwork";
import { defaultLaunchForm, equalPrizeEconomics, formFromConfiguration, payloadFromForm, usePermanentNumbers } from "../components/launch/form-values.ts";
import { applyTemplate, defaultAutomationForm, upgradeSeasonDraft } from "../components/automations/form-values.ts";
import { launchContractVersion, type LaunchConfiguration } from "../lib/launch-config.ts";
import { parseLaunchDraft, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { assertRuntimeArtifact } from "../lib/season-runtime.ts";
import { seasonRuntimePreviews } from "../lib/season-runtime-preview.ts";
import { validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { runtimeArtifact, runtimePlan } from "./season-runtime.fixture.ts";

function v10Artifact() {
  const artifact = runtimeArtifact();
  artifact.contractVersion = "affiliate-v10";
  for (const step of artifact.steps) step.payload.contract.algorithmVersion = "unique-rank-v6";
  return artifact;
}
function v10Payload() {
  const payload = v10Artifact().steps[0].payload;
  payload.contract.saleStartAt = "2000000000";
  return payload;
}

test("new V10 drafts fix Solidity identity semantics, cap and six equal prizes without caller number inputs", () => {
  const form = defaultLaunchForm("11155111"), payload = payloadFromForm(form);
  assert.equal(launchContractVersion(payload), "affiliate-v10");
  assert.equal(payload.contract.algorithmVersion, "unique-rank-v6");
  assert.equal(payload.contract.maxMintsPerWallet, "20");
  assert.deepEqual(equalPrizeEconomics(form), { count: 6, each: "1", total: "6", percentEach: "10" });
  for (const field of ["numbers", "combinationKey", "seed", "permanentCombinationKey"]) {
    assert(!Object.hasOwn(payload.contract, field));
    assert.throws(() => parseLaunchDraft({ ...payload, contract: { ...payload.contract, [field]: "0" } }), /unsupported field/);
  }
  for (const maxMintsPerWallet of [undefined, "0", "19", "21", "020"]) assert.throws(() => parseLaunchDraft({ ...payload, contract: { ...payload.contract, maxMintsPerWallet } }), /exactly 20/);
});

test("V10 frozen manifests bind the new algorithm while V8/V9 round trips retain their original version and hash", () => {
  for (const version of ["affiliate-v8", "affiliate-v9", "affiliate-v10"] as const) {
    const payload = v10Payload();
    if (version !== "affiliate-v10") payload.contract.algorithmVersion = "unique-rank-v5";
    if (version === "affiliate-v8") delete payload.contract.maxMintsPerWallet;
    const validation = validateLaunchPayload(payload, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true });
    assert.equal(validation.valid, true, validation.issues.join("; "));
    const artifact = { schemaVersion: 1 as const, contractVersion: version, ...validation.payload! }, hash = launchArtifactHash(artifact);
    assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
    const roundTrip = payloadFromForm(formFromConfiguration({ label: version, payload: validation.payload! } as LaunchConfiguration));
    // The form keeps reviewed terms; network VRF pins are normalized again by validation.
    const normalized = validateLaunchPayload(roundTrip);
    assert.equal(launchArtifactHash({ schemaVersion: 1, contractVersion: version, ...normalized.payload! }), hash);
    assert.throws(() => verifyLaunchExport({ ...artifact, contractVersion: version === "affiliate-v10" ? "affiliate-v9" : "affiliate-v10", contentHash: hash }, hash), /version/);
  }
});

test("explicit V10 upgrades preserve custom economics, timing, identities and artwork but clear incompatible deployment pins", () => {
  const prior = { ...defaultLaunchForm("11155111"), algorithmVersion: "unique-rank-v5" as const, maxSupply: "250", mintPriceEth: "0.02", winnerCount: "2", prizePercent: "40", minAffiliateReferrals: "3", saleStartAt: "2000000000", seasonId: `0x${"12".repeat(32)}`, seasonName: "Original season", name: "Original collection", collectionColor: "#CC1200", factoryMode: "existing" as const, factoryAddress: "0x4444444444444444444444444444444444444444", affiliateEligibilityAddress: "0x5555555555555555555555555555555555555555", winnerCreditsAddress: "0x6666666666666666666666666666666666666666", winnerCreditSponsorshipEth: "0.1" };
  const frozen = structuredClone(prior), upgraded = usePermanentNumbers(prior);
  assert.deepEqual(prior, frozen);
  for (const field of ["maxSupply", "mintPriceEth", "winnerCount", "prizePercent", "minAffiliateReferrals", "saleStartAt", "seasonId", "seasonName", "name", "collectionColor", "winnerCreditSponsorshipEth"] as const) assert.equal(upgraded[field], prior[field]);
  assert.equal(upgraded.algorithmVersion, "unique-rank-v6");
  assert.equal(upgraded.factoryMode, "new");
  for (const field of ["factoryAddress", "affiliateEligibilityAddress", "winnerCreditsAddress"] as const) assert.equal(upgraded[field], "");
  const season = defaultAutomationForm(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], "11155111", prior.seasonId);
  season.steps[0].form = prior;
  const converted = upgradeSeasonDraft(season, () => { throw new Error("must preserve identity"); });
  assert.equal(converted.steps[0].id, season.steps[0].id);
  assert.equal(converted.steps[0].form.winnerCount, "2");
  assert.equal(converted.seasonId, prior.seasonId);
});

test("historical templates cannot swap a V10 destination's registry, version or factory", () => {
  const form = defaultAutomationForm(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], "11155111", `0x${"12".repeat(32)}`);
  const destination = form.steps[0];
  destination.form.winnerCreditsAddress = "0x1111111111111111111111111111111111111111";
  destination.form.affiliateEligibilityAddress = "0x2222222222222222222222222222222222222222";
  const historical = runtimeArtifact().steps[0].payload;
  const copied = applyTemplate(destination, { label: "V9", payload: historical } as LaunchConfiguration);
  assert.equal(copied.form.algorithmVersion, "unique-rank-v6");
  assert.equal(copied.form.maxMintsPerWallet, "20");
  assert.equal(copied.form.winnerCreditsAddress, destination.form.winnerCreditsAddress);
  assert.equal(copied.form.affiliateEligibilityAddress, destination.form.affiliateEligibilityAddress);
  assert.equal(copied.form.factoryAddress, destination.form.factoryAddress);
});

test("V10 season execution accepts only matching contract identities and retains V9 resume support", () => {
  const v10 = v10Artifact();
  assert.doesNotThrow(() => assertRuntimeArtifact(v10, new Date("2030-01-01")));
  assert.doesNotThrow(() => assertRuntimeArtifact(runtimeArtifact(), new Date("2030-01-01")));
  assert.equal(validateAutomationPayload(v10, new Date("2030-01-01")).valid, false, "An artifact must be unwrapped before validating its plan");
  const { schemaVersion: _, contractVersion: __, kind: ___, ...plan } = v10;
  assert.equal(validateAutomationPayload(plan, new Date("2030-01-01")).valid, true);
  const missingCap = structuredClone(v10); delete missingCap.steps[0].payload.contract.maxMintsPerWallet;
  assert.throws(() => assertRuntimeArtifact(missingCap, new Date("2030-01-01")), /consistent network/);
  v10.steps[1].payload.contract.algorithmVersion = "unique-rank-v5";
  assert.throws(() => assertRuntimeArtifact(v10, new Date("2030-01-01")), /consistent network/);
  assert.match(validateAutomationPayload({ ...plan, steps: v10.steps }, new Date("2030-01-01")).issues.join("; "), /same contract version/);
});

test("V10 identity helpers reproduce the constructor key and keep decoded token ID separate from score", () => {
  const deployment = { chainId: 11155111n, collectionAddress: "0x1111111111111111111111111111111111111111", roundId: 1n, seasonId: `0x${"12".repeat(32)}`, maxSupply: 65536n };
  const key = derivePermanentCombinationKey(deployment);
  assert.equal(key, keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256", "address", "uint256", "bytes32", "uint256"], [keccak256(toUtf8Bytes("MANEKINEKO_PERMANENT_COMBINATION_V1")), deployment.chainId, deployment.collectionAddress, deployment.roundId, deployment.seasonId, deployment.maxSupply])));
  const seen = new Set<string>();
  for (const tokenId of [1, 2, 16, 256, 1000, 32768, 65535, 65536]) {
    const encoded = encodePermanentCombination(tokenId, key);
    assert.equal(Object.hasOwn(encoded, "score"), false);
    assert(encoded.numbers.every(n => n >= 1 && n <= 16));
    assert(!seen.has(encoded.combinationCode)); seen.add(encoded.combinationCode);
    assert.deepEqual(decodePermanentCombination(encoded.numbers, key), { tokenId: String(tokenId), combinationCode: encoded.combinationCode });
    const old = encodeScrambledRank(tokenId, key);
    assert.equal(decodeScrambledCombination(old.numbers, key).score, String(tokenId), "Historical score semantics stay intact");
  }
  assert.notEqual(derivePermanentCombinationKey({ ...deployment, collectionAddress: "0x2222222222222222222222222222222222222222" }), key);
  assert.throws(() => decodePermanentCombination([0, 1, 1, 1], key));
  assert.throws(() => encodePermanentCombination(65537, key));
});

test("permanent previews contain identity and no draw state; historical artwork still renders its revealed score", () => {
  const identity = encodePermanentCombination(81, `0x${"42".repeat(32)}`);
  const input = { seasonId: `0x${"12".repeat(32)}`, seasonName: "Original & season", collectionName: "Cinder Study", collectionColor: "#CC1200", textColor: "#FFFFFF" as const, ...identity, tokenId: 81 };
  const svg = buildTinctaPermanentSvg(input);
  assert.match(svg, /COMBINATION CODE/); assert.match(svg, /PERMANENT EDITION/);
  assert(!/SCORE|SEALED|WINNING|REFUNDABLE|Award #/.test(svg));
  assert.throws(() => buildTinctaPermanentSvg({ ...input, combinationCode: "65536" }));
  const historical = buildTinctaSvg({ ...input, state: "revealed", score: 1000, awardRank: 1 });
  assert.match(historical, /SCORE/); assert.match(historical, /WINNING EDITION/);
});

test("V10 social previews describe permanent numbers without changing the historical V9 message", () => {
  const prior = runtimePlan(), v10 = structuredClone(prior);
  for (const step of v10.plan.steps) step.payload.contract.algorithmVersion = "unique-rank-v6";
  const old = seasonRuntimePreviews(prior).find(item => item.message.event === "collection-live")!.message;
  const permanent = seasonRuntimePreviews(v10).find(item => item.message.event === "collection-live")!.message;
  assert(!old.replyKeys.includes("numbers"));
  assert(permanent.replyKeys.includes("numbers"));
  assert(permanent.replies.some(reply => reply.includes("permanent numbers") && reply.includes("One VRF draw after sellout")));
  assert.equal(old.post, permanent.post);
});
