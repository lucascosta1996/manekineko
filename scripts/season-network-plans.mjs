import assert from 'node:assert/strict';
import { catalogSeasonOrder } from '../apps/launch/lib/season-catalog-order.ts';
import { parseAutomationDraft } from '../apps/launch/lib/launch-automation-validation.ts';

/** Migrate editable catalog plans only; on-chain and frozen snapshots are never inputs. */
export function organizeSeasonDraft(record) {
  assert.equal(record.status, 'draft', 'Only editable season drafts can be organized.');
  const plan = structuredClone(record.plan);
  const catalog = catalogSeasonOrder(plan.seasonId) !== null;
  const moving = catalog && plan.chainId !== '1';
  if (catalog) plan.chainId = '1';
  for (const step of plan.steps) {
    const c = step.payload.contract, o = step.payload.operations;
    c.chainId = plan.chainId;
    if (['unique-rank-v4','unique-rank-v5'].includes(c.algorithmVersion)) c.minAffiliateReferrals = '1';
    if (catalog && c.algorithmVersion === 'unique-rank-v5') {
      const upgrading = c.maxMintsPerWallet !== '20';
      c.maxMintsPerWallet = '20';
      if (moving || upgrading) Object.assign(o, {factoryMode:'new',factoryAddress:'',affiliateEligibilityAddress:'',winnerCreditsAddress:''});
    }
    if (moving) {
      // A Sepolia signer or deployed address must not become the Mainnet default.
      c.initialOwner = ''; c.enrollmentSigner = ''; c.saleStartAt = '0';
      Object.assign(o,{deployerAddress:'',factoryOwnerAddress:''});
    }
  }
  if (moving) plan.startAt = null;
  return parseAutomationDraft(plan);
}
