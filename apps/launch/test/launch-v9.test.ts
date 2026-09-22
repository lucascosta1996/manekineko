import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultLaunchForm, payloadFromForm, formFromConfiguration } from '../components/launch/form-values.ts';
import { launchContractVersion, type LaunchConfiguration } from '../lib/launch-config.ts';
import { parseLaunchDraft } from '../lib/launch-config-validation.ts';
import { requireCurrentCollection } from '../lib/current-launch.ts';
import { applyTemplate, defaultAutomationForm } from '../components/automations/form-values.ts';

test('V9 cap is mandatory and historical drafts retain their original version',()=>{
 const current=payloadFromForm({...defaultLaunchForm(),algorithmVersion:"unique-rank-v5"});assert.equal(launchContractVersion(current),'affiliate-v9');assert.equal(current.contract.maxMintsPerWallet,'20');
 assert.deepEqual(requireCurrentCollection(current),current);
 for(const cap of ['0','19','21','020',''])assert.throws(()=>parseLaunchDraft({...current,contract:{...current.contract,maxMintsPerWallet:cap}}),/exactly 20/);
 const old=structuredClone(current);delete old.contract.maxMintsPerWallet;
 assert.equal(launchContractVersion(old),'affiliate-v8');assert.throws(()=>requireCurrentCollection(old),/Upgrade this draft to V10/);
 assert.equal(payloadFromForm(formFromConfiguration({label:'Historical',payload:old} as LaunchConfiguration)).contract.maxMintsPerWallet,undefined);
});

test('copying an older template into a V9 season cannot drop its cap or attach an older credit registry',()=>{
 const form=defaultAutomationForm(['11111111-1111-4111-8111-111111111111'],'11155111',`0x${'12'.repeat(32)}`);
 form.steps[0].form.algorithmVersion="unique-rank-v5";
 form.steps[0].form.winnerCreditsAddress='0x5555555555555555555555555555555555555555';
 const old=payloadFromForm({...defaultLaunchForm('11155111'),algorithmVersion:'unique-rank-v5'});delete old.contract.maxMintsPerWallet;old.operations.winnerCreditsAddress='0x4444444444444444444444444444444444444444';
 const copied=applyTemplate(form.steps[0],{label:'V8',payload:old} as LaunchConfiguration);
 assert.equal(launchContractVersion(payloadFromForm(copied.form)),'affiliate-v9');assert.equal(copied.form.winnerCreditsAddress,form.steps[0].form.winnerCreditsAddress);
});
