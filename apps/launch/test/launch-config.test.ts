import assert from "node:assert/strict";
import { test } from "node:test";
import { ETHEREUM_VRF } from "@manekineko/contract-abi/v2-config";
import { canonicalLaunchJson, launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { LaunchConfigurationError, type LaunchArtifact } from "../lib/launch-config.ts";
import { parseLaunchDraft, parseLaunchLabel, parseLaunchRevision, requireValidLaunchPayload, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { launchFixture } from "./launch-config.fixture.ts";

test("incomplete drafts are saved without pretending their missing addresses are valid", () => {
  const input = launchFixture();
  input.contract.initialOwner = ""; input.contract.enrollmentSigner = ""; input.contract.randomnessFundingWei = "";
  input.operations.deployerAddress = ""; input.operations.factoryOwnerAddress = "";
  assert.deepEqual(parseLaunchDraft(input), input);
  assert.equal(validateLaunchPayload(input).valid, false);
  assert.throws(() => requireValidLaunchPayload(input), error => error instanceof LaunchConfigurationError && error.status === 422);
});

test("the same reviewed V4 parser pins network VRF and exact per-referral rates", () => {
  const result = requireValidLaunchPayload(launchFixture());
  assert.equal(result.contract.vrfCoordinator, ETHEREUM_VRF["11155111"].coordinator);
  assert.equal(result.contract.keyHash, ETHEREUM_VRF["11155111"].keyHash);
  assert.deepEqual(result.contract.affiliateRatesBps, ["100", "200", "0"]);
  assert.equal(result.contract.prizeBps, "6000");
  assert.equal(result.contract.activateSale, false);
});

for (const [name, change] of [
  ["local or unrelated networks", (p: ReturnType<typeof launchFixture>) => { p.contract.chainId = "31337"; }],
  ["commission that invades the prize", (p: ReturnType<typeof launchFixture>) => { p.contract.affiliateRatesBps[1] = "4001"; }],
  ["noncanonical numbers", (p: ReturnType<typeof launchFixture>) => { p.contract.maxSupply = "01000"; }],
  ["incorrect rate count", (p: ReturnType<typeof launchFixture>) => { p.contract.affiliateRatesBps.pop(); }],
  ["nonexact wei accounting", (p: ReturnType<typeof launchFixture>) => { p.contract.mintPriceWei = "10002"; }],
  ["another coordinator", (p: ReturnType<typeof launchFixture>) => { p.contract.vrfCoordinator = p.contract.initialOwner; }],
  ["another VRF key", (p: ReturnType<typeof launchFixture>) => { p.contract.keyHash = "0x" + "11".repeat(32); }],
  ["zero VRF funding", (p: ReturnType<typeof launchFixture>) => { p.contract.randomnessFundingWei = "0"; }],
  ["weakened VRF confirmations", (p: ReturnType<typeof launchFixture>) => { p.contract.requestConfirmations = "3"; }],
  ["enrollment window reaching the mint deadline", (p: ReturnType<typeof launchFixture>) => { p.operations.enrollmentWindowSeconds = p.contract.mintDurationSeconds; }],
  ["zero enrollment window", (p: ReturnType<typeof launchFixture>) => { p.operations.enrollmentWindowSeconds = "0"; }],
  ["unavailable factory ownership transfer", (p: ReturnType<typeof launchFixture>) => { p.operations.factoryOwnerAddress = p.contract.initialOwner; }],
  ["the deployer as the enrollment signer", (p: ReturnType<typeof launchFixture>) => { p.contract.enrollmentSigner = p.operations.deployerAddress; }],
  ["the round owner as the enrollment signer", (p: ReturnType<typeof launchFixture>) => { p.contract.enrollmentSigner = p.contract.initialOwner; }],
  ["an existing factory without an address", (p: ReturnType<typeof launchFixture>) => { p.operations.factoryMode = "existing"; }],
  ["a new factory with a claimed existing address", (p: ReturnType<typeof launchFixture>) => { p.operations.factoryAddress = p.operations.deployerAddress; }],
] as const) test(`finalization rejects ${name}`, () => {
  const input = launchFixture(); change(input);
  assert.equal(validateLaunchPayload(input).valid, false);
});

test("an existing factory's address is recorded for later on-chain ownership verification", () => {
  const input = launchFixture(); input.operations.factoryMode = "existing"; input.operations.factoryAddress = "0x4444444444444444444444444444444444444444";
  assert.equal(requireValidLaunchPayload(input).operations.factoryAddress, input.operations.factoryAddress);
});

test("independent referral rates are not summed as a sales-wide affiliate pool", () => {
  const input = launchFixture(); input.contract.prizeBps = "6000"; input.contract.affiliateRatesBps = ["4000", "4000", "4000"];
  assert.equal(validateLaunchPayload(input).valid, true);
});

test("draft bodies cannot carry extra fields, private keys, nested objects or unbounded notes", () => {
  const valid = launchFixture();
  for (const input of [
    { ...valid, privateKey: "secret" }, { ...valid, contract: { ...valid.contract, privateKey: "secret" } },
    { ...valid, operations: { ...valid.operations, notes: "a".repeat(4001) } },
    { ...valid, contract: { ...valid.contract, name: {} } },
    { ...valid, contract: { ...valid.contract, affiliateRatesBps: Array(101).fill("0") } },
    { ...valid, contract: { ...valid.contract, activateSale: true } },
  ]) assert.throws(() => parseLaunchDraft(input), LaunchConfigurationError);
});

test("labels and optimistic revisions are bounded and canonical", () => {
  assert.equal(parseLaunchLabel("  Qualification  "), "Qualification");
  assert.equal(parseLaunchRevision(3), 3);
  for (const value of [0, -1, 1.1, "1", Number.MAX_SAFE_INTEGER]) assert.throws(() => parseLaunchRevision(value), LaunchConfigurationError);
  for (const value of [" ", "x".repeat(101), "a\u0000b"]) assert.throws(() => parseLaunchLabel(value), LaunchConfigurationError);
});

test("artifact hashes ignore JSON object ordering but bind every term and position order", () => {
  const payload = requireValidLaunchPayload(launchFixture());
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: "affiliate-v4", ...payload };
  const reordered: LaunchArtifact = { operations: artifact.operations, contract: artifact.contract, contractVersion: artifact.contractVersion, schemaVersion: artifact.schemaVersion };
  assert.equal(launchArtifactHash(artifact), launchArtifactHash(reordered));
  const modified = structuredClone(artifact); modified.contract.affiliateRatesBps.reverse();
  assert.notEqual(launchArtifactHash(artifact), launchArtifactHash(modified));
  modified.operations.notes += " changed";
  assert.notEqual(launchArtifactHash(artifact), launchArtifactHash(modified));
  assert.equal(canonicalLaunchJson({ z: "2", a: ["1", "0"] }), '{"a":["1","0"],"z":"2"}');
  assert.throws(() => canonicalLaunchJson({ bad: undefined }));
});
