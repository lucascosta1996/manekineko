import { Interface, formatEther, type TransactionRequest } from 'ethers';
import { controllerAbi, roundAbi, creditsAbi, type Snapshot } from './chain.ts';
import type { ProtocolConfig } from './config.ts';
export type OperatorAction = { id: string; title: string; description: string; operatorOnly: boolean; secondary: boolean; request: TransactionRequest };
/** Only executable state transitions enter the queue. No timer or server can approve them. */
export function operatorActions(s: Snapshot, config: ProtocolConfig): OperatorAction[] {
  const actions: OperatorAction[] = [], controller = new Interface(controllerAbi), round = new Interface(roundAbi), credits = new Interface(creditsAbi);
  const add = (id: string, title: string, description: string, to: string, data: string, operatorOnly = false, value = 0n, secondary = false) => actions.push({ id, title, description, operatorOnly, secondary, request: { to, data, value } });
  const r = s.round;
  const following = s.count < s.catalogCount;
  const shortfall = following && s.cost > s.operatingBalance ? s.cost - s.operatingBalance : 0n;
  const treasuryPurpose = 'The treasury funds infrastructure costs, future functionality and Tincta projects.';
  const holderProtection = (config.version === 13 || config.version === 14) ? ' Successful draws also fund the separate 10% season holder pool, which the operator cannot withdraw. Its limited claims unlock only after every collection in the season settles.' : '';
  const batch = !!r && s.sealed && r.id === s.count && [4, 5, 6].includes(r.phase) &&
    (r.phase !== 4 || r.canFinalize) && (following || r.operatorRemaining > 0n || r.phase === 4);
  if (batch && r) {
    add('settle', following ? 'Settle & prepare next collection' : 'Settle final collection',
      `${r.phase === 4 ? 'Finalize the verified draw, then send' : 'Send'} ${formatEther(r.operatorRemaining)} ETH of remaining protocol treasury allocation to ${s.operator}.${r.executionReserve > 0n && (r.phase === 4 || r.executionRecipient.toLowerCase() === s.operator.toLowerCase()) ? ` Also return the separately funded ${formatEther(r.executionReserve)} ETH execution reward to the operator.` : ''}${following ? ` Prepare collection ${s.count + 1} and publish its voting schedule.` : ' This is the final collection in the catalog.'} ${shortfall ? `Include ${formatEther(shortfall)} ETH of separate operating funding in this same transaction.` : 'No additional operating ETH is required.'} All steps succeed together or the transaction reverts. ${treasuryPurpose} Prize, affiliate and refund reserves stay protected.${holderProtection}`,
      config.controller, controller.encodeFunctionData('settleAndPrepare', [s.count, r.operatorRemaining]), true, shortfall);
  }
  if (s.canPrepare) {
    add('prepare', 'Prepare the next collection', `Prepare collection ${s.count + 1}. This publishes its voting deadline and commits ${formatEther(s.cost)} ETH of operating funds. ${shortfall ? `Include the ${formatEther(shortfall)} ETH shortfall in this transaction.` : 'The controller is already funded.'} Minting will open at that deadline.`, config.controller, controller.encodeFunctionData('prepareNext'), false, shortfall, batch);
  }
  if (r) {
    if (r.phase === 2) add('request', 'Request the draw', 'Retry the original request that failed before reaching Chainlink. This cannot reroll accepted randomness.', r.address, round.encodeFunctionData('requestRandomness'));
    if (r.phase === 4) add('finalize', r.canFinalize ? 'Finalize the draw' : 'Advance draw processing', r.canFinalize ? 'Process up to eight deterministic attempts using the verified randomness already received.' : 'The next eight deterministic attempts need a progress transaction before settlement. This preserves the same randomness and winner-selection rules.', r.address, round.encodeFunctionData('finalizeDraw', [8]), false, 0n, batch);
    if (r.operatorAvailable > 0n) add('withdraw', 'Withdraw protocol treasury', `Send ${formatEther(r.operatorAvailable)} ETH to the fixed operator wallet. ${treasuryPurpose} Prize, affiliate and refund obligations stay reserved.${holderProtection}`, r.address, round.encodeFunctionData('withdrawOperator', [s.operator, r.operatorAvailable]), true, 0n, batch);
    if ([5, 6].includes(r.phase) && r.growth > 0n) add('growth', 'Recover unused affiliate reserve', `Recover ${formatEther(r.growth)} ETH of division dust or an unallocated pool. Qualified affiliate claims stay protected.`, r.address, round.encodeFunctionData('withdrawGrowthReserve', [s.operator, r.growth]), true, 0n, true);
    if ([4, 5, 6, 7].includes(r.phase) && !r.subscriptionClosed) add('vrf', 'Recover unused draw funding', 'Return unused VRF funding after entropy arrived or refunds opened. A pending request may still prevent coordinator withdrawal; holder refunds and next preparation remain independent.', r.address, round.encodeFunctionData('withdrawRandomnessFunding', [s.operator]), true, 0n, true);
    if (r.phase === 7 && r.executionReserve > 0n) add('execution', 'Recover unused executor funding', `Return ${formatEther(r.executionReserve)} ETH of separate executor funding to the operator. Full mint-price refunds remain reserved.`, r.address, round.encodeFunctionData('recoverExecutionFunding'), true, 0n, true);
    if (![0, 1].includes(r.phase) && r.sponsorship > 0n) add('sponsor', 'Recover unused sponsorship', `Return ${formatEther(r.sponsorship)} ETH of unused sponsorship to the fixed operator wallet.`, s.credits, credits.encodeFunctionData('withdrawSponsorship', [r.address, s.operator, r.sponsorship]), true, 0n, true);
  }
  if (s.sealed && s.count === s.catalogCount && s.operatingBalance > 0n)
    add('operating', 'Recover remaining operating funds', `Return ${formatEther(s.operatingBalance)} ETH after every catalog collection has been prepared.`, config.controller, controller.encodeFunctionData('withdrawOperatingFunds', [s.operatingBalance]), true);
  return actions;
}
