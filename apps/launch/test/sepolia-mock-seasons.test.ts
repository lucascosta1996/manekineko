import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { mockSepoliaSeason } from "../lib/sepolia-mock-seasons.ts";
import { seasonRuntimePreviews } from "../lib/season-runtime-preview.ts";
import { renderSeasonSocialSvg } from "@manekineko/contract-abi/season-social-image";
import type { AutomationPlan } from "../lib/launch-automation.ts";

test("all 22 seasons and 216 collections preserve terms with independent test identities", async () => {
  const catalog = JSON.parse(await readFile(new URL("../../../collection-names.json", import.meta.url), "utf8"));
  const used = new Set<string>(catalog.flatMap((season: { theme: string; collections: { name: string }[] }) => season.collections.map(item => item.name.toLowerCase())));
  let count = 0;
  for (const entry of catalog) {
    const form = defaultAutomationForm(entry.collections.map(() => randomUUID()), "1", `0x${"12".repeat(32)}`);
    form.name = `Mainnet season ${entry.season}`;
    form.steps.forEach((step, index) => { step.form.name = entry.collections[index].name; step.form.collectionColor = entry.collections[index].color; });
    const source = payloadFromAutomationForm(form), before = structuredClone(source);
    const mock = mockSepoliaSeason(source, used);
    assert.deepEqual(source, before);
    assert.notEqual(mock.name, source.name); assert.notEqual(mock.seasonId, source.seasonId);
    assert.equal(mock.chainId, "11155111"); assert.equal(mock.startAt, null);
    assert.deepEqual(mock.timing, source.timing); assert.equal(mock.intervalSeconds, source.intervalSeconds);
    mock.steps.forEach((step, index) => {
      count++;
      const original = source.steps[index], actual = step.payload.contract;
      assert.notEqual(step.id, original.id); assert.notEqual(actual.name, original.payload.contract.name);
      assert.notEqual(actual.symbol, original.payload.contract.symbol); assert.equal(step.label, actual.name);
      const changed = new Set(["chainId", "seasonId", "seasonName", "name", "symbol", "initialOwner", "enrollmentSigner", "saleStartAt", "vrfCoordinator", "keyHash"]);
      for (const [key, value] of Object.entries(original.payload.contract)) if (!changed.has(key)) assert.deepEqual(actual[key as keyof typeof actual], value, key);
      assert.equal(step.payload.operations.enrollmentWindowSeconds, original.payload.operations.enrollmentWindowSeconds);
      assert.equal(step.payload.operations.winnerCreditSponsorshipWei, original.payload.operations.winnerCreditSponsorshipWei);
      assert.equal(step.payload.operations.factoryAddress, ""); assert.equal(actual.initialOwner, "");
    });
  }
  assert.equal(catalog.length, 22); assert.equal(count, 216);
});

test("network credentials, custom promotional text and calendar dates never carry over", () => {
  const source = payloadFromAutomationForm(defaultAutomationForm([randomUUID()], "1", `0x${"12".repeat(32)}`));
  source.startAt = "2035-01-01T00:00:00Z";
  source.social!.enabled = true;
  source.social!.selloutTemplate = "Production brand https://tincta.xyz";
  const step = source.steps[0]; step.deadline = { mode: "fixed", at: "2035-02-01T00:00:00Z" };
  Object.assign(step.payload.contract, { initialOwner: `0x${"11".repeat(20)}`, enrollmentSigner: `0x${"22".repeat(20)}`, vrfCoordinator: `0x${"33".repeat(20)}`, keyHash: `0x${"44".repeat(32)}` });
  Object.assign(step.payload.operations, { factoryMode: "existing", factoryAddress: `0x${"55".repeat(20)}`, notes: "Production brand", winnerCreditsAddress: `0x${"66".repeat(20)}` });
  const mock = mockSepoliaSeason(source);
  assert.equal(mock.steps[0].deadline.mode, "fixed"); assert.equal(mock.steps[0].deadline.at, null);
  assert.equal(mock.social!.enabled, true);
  assert.doesNotMatch(JSON.stringify(mock), /Production brand|tincta.xyz|2035|0x111111|0x222222|0x333333|0x444444|0x555555|0x666666/);
  assert.throws(() => mockSepoliaSeason(mock), /Mainnet season/);
});

test("Sepolia preview posts, alt text and images omit hardcoded production branding", () => {
  const source = payloadFromAutomationForm(defaultAutomationForm([randomUUID()], "1", `0x${"12".repeat(32)}`));
  const mock = mockSepoliaSeason(source);
  const previews = seasonRuntimePreviews({ id: randomUUID(), revision: 1, plan: mock } as AutomationPlan);
  assert.equal(previews.length, 8);
  for (const preview of previews) {
    assert.doesNotMatch(JSON.stringify(preview.message), /tincta|manekineko/i);
    assert.doesNotMatch(renderSeasonSocialSvg(preview.message), /tincta|manekineko/i);
    assert.match(preview.message.post, /Sepolia test/);
  }
  const mainnet = seasonRuntimePreviews({ id: randomUUID(), revision: 1, plan: source } as AutomationPlan);
  assert.match(renderSeasonSocialSvg(mainnet[0].message), /Tincta/);
  assert.match(renderSeasonSocialSvg(mainnet[0].message), /tincta.xyz/);
});
