import assert from "node:assert/strict";
import test from "node:test";
import { defaultLaunchForm, qualifiedAffiliateExample, payloadFromForm } from "../components/launch/form-values.ts";
import { defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { parseAutomationDraft, validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { requireCurrentSeason } from "../lib/current-launch.ts";
import { parseLaunchDraft } from "../lib/launch-config-validation.ts";
import { listLaunchAutomations } from "../lib/launch-automation-store.ts";
import type { Pool } from "pg";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("one referral default applies to each network and every new season collection", () => {
  for (const chain of ["1", "11155111"] as const) {
    const form=defaultAutomationForm([id],chain,`0x${"12".repeat(32)}`);
    assert.equal(form.steps[0].form.minAffiliateReferrals,"1");
    assert.equal(payloadFromAutomationForm(form).steps[0].payload.contract.minAffiliateReferrals,"1");
  }
});
test("affiliate preview responds to positions while retaining the contract payout cap", () => {
  const form=defaultLaunchForm();
  assert.deepEqual(qualifiedAffiliateExample({...form,slots:"8"}),{each:"0.003",distributed:"0.024",growthReserve:"1.976"});
  assert.deepEqual(qualifiedAffiliateExample({...form,slots:"20"}),{each:"0.003",distributed:"0.06",growthReserve:"1.94"});
  assert.deepEqual(qualifiedAffiliateExample({...form,slots:"1"}),{each:"0.003",distributed:"0.003",growthReserve:"1.997"});
  assert.deepEqual(qualifiedAffiliateExample({...form,slots:"4",minAffiliateReferrals:"200"}),{each:"0.5",distributed:"2",growthReserve:"0"});
  assert.equal(qualifiedAffiliateExample({...form,slots:"8",minAffiliateReferrals:"200"}),null);
  assert.equal(qualifiedAffiliateExample({...form,slots:"0"}),null);
});
test("staging allows Mainnet season planning while preparation and standalone configuration stay restricted", async () => {
  const previous=process.env.MANEKINEKO_CHAIN_ID;process.env.MANEKINEKO_CHAIN_ID="11155111";
  try {
    const plan=payloadFromAutomationForm(defaultAutomationForm([id],"1",`0x${"12".repeat(32)}`));
    assert.equal(parseAutomationDraft(plan).chainId,"1");
    assert.equal(requireCurrentSeason(plan).steps[0].payload.contract.chainId,"1");
    assert.equal(validateAutomationPayload(plan).valid,false);
    assert.match(validateAutomationPayload(plan).issues.join(" "),/only supports Ethereum Sepolia/);
    assert.throws(()=>parseLaunchDraft(payloadFromForm(defaultLaunchForm("1"))),/only supports Ethereum Sepolia/);
    let filter:unknown;
    const db={query:async (_sql:string,values:unknown[])=>{filter=values[2];return {rows:[]};}} as unknown as Pick<Pool,"query">;
    await listLaunchAutomations(db,null,"1");assert.equal(filter,"1");
    await listLaunchAutomations(db,null,"11155111");assert.equal(filter,"11155111");
    await assert.rejects(()=>listLaunchAutomations(db,null,"31337"),/Mainnet or Sepolia/);
    plan.steps[0].payload.contract.chainId="11155111";assert.throws(()=>parseAutomationDraft(plan),/season’s network/);
  }finally{if(previous===undefined)delete process.env.MANEKINEKO_CHAIN_ID;else process.env.MANEKINEKO_CHAIN_ID=previous;}
});
