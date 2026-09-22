import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { configuredLaunchChain } from "../lib/chain-policy.ts";
import { parseLaunchDraft, requireValidLaunchPayload } from "../lib/launch-config-validation.ts";
import { parseAutomationDraft } from "../lib/launch-automation-validation.ts";
import { createLaunchConfiguration, exportLaunchConfiguration, finalizeLaunchConfiguration } from "../lib/launch-config-store.ts";
import { createLaunchAutomation, exportLaunchAutomation, prepareLaunchAutomation } from "../lib/launch-automation-store.ts";
import { defaultLaunchForm } from "../components/launch/form-values.ts";
import { defaultAutomationForm } from "../components/automations/form-values.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture } from "./launch-automation.fixture.ts";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("staging rejects forged Mainnet drafts before database writes and accepts Sepolia", async () => {
  const previous = process.env.MANEKINEKO_CHAIN_ID;
  process.env.MANEKINEKO_CHAIN_ID = "11155111";
  try {
    const payload = launchFixture();
    assert.equal(requireValidLaunchPayload(payload).contract.chainId, "11155111");
    payload.contract.chainId = "1";
    const db = { query: async () => { assert.fail("A disallowed-chain draft reached the database"); } } as unknown as Pick<Pool, "query">;
    await assert.rejects(createLaunchConfiguration(db, { userId: id }, { label: "Mainnet", payload }), /only supports Ethereum Sepolia/);
    const plan = automationFixture(); plan.chainId = "1";
    await assert.rejects(createLaunchAutomation(db, { userId: id }, { plan }), /season’s network/);
    plan.chainId = "11155111"; plan.steps[1].payload.contract.chainId = "1";
    assert.throws(() => parseAutomationDraft(plan), /season’s network/);
  } finally {
    if (previous === undefined) delete process.env.MANEKINEKO_CHAIN_ID;
    else process.env.MANEKINEKO_CHAIN_ID = previous;
  }
});

test("previously saved Mainnet snapshots cannot bypass staging via finalize, prepare or export", async () => {
  const previous = process.env.MANEKINEKO_CHAIN_ID;
  process.env.MANEKINEKO_CHAIN_ID = "11155111";
  try {
    const payload = launchFixture(); payload.contract.chainId = "1";
    const plan = automationFixture(); plan.steps[1].payload.contract.chainId = "1";
    const db = { query: async () => ({ rows: [{ payload, plan, status: "prepared", prepared_artifact: plan, content_hash: "test" }] }) } as unknown as Pick<Pool, "query">;
    await assert.rejects(finalizeLaunchConfiguration(db, { userId: id }, id, 1), /only supports Ethereum Sepolia/);
    await assert.rejects(exportLaunchConfiguration(db, id), /only supports Ethereum Sepolia/);
    await assert.rejects(prepareLaunchAutomation(db, { userId: id }, id, 1), /only supports Ethereum Sepolia/);
    await assert.rejects(exportLaunchAutomation(db, id), /only supports Ethereum Sepolia/);
  } finally {
    if (previous === undefined) delete process.env.MANEKINEKO_CHAIN_ID;
    else process.env.MANEKINEKO_CHAIN_ID = previous;
  }
});

test("network restrictions fail closed on typos and UI defaults use the server-selected chain", () => {
  for (const value of ["sepolia", "31337", "11155111 ", "011155111"]) assert.throws(() => configuredLaunchChain({ MANEKINEKO_CHAIN_ID: value }), /restriction is invalid/);
  assert.equal(configuredLaunchChain({}), null);
  const payload = launchFixture(); payload.contract.chainId = "1";
  assert.equal(parseLaunchDraft(payload).contract.chainId, "1");
  assert.equal(defaultLaunchForm("11155111").chainId, "11155111");
  const automation = defaultAutomationForm([id], "11155111");
  assert.equal(automation.chainId, "11155111");
  assert.equal(automation.steps[0].form.chainId, "11155111");
});
