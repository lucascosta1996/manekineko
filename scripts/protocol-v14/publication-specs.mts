import { Contract, type Provider } from 'ethers';
import { readFile } from 'node:fs/promises';
import type { DeploymentExpectation, Verification } from './verify-deployment.mts';
import type { SourceSpec } from './source-publication.mts';
/** Derive all executable graph contracts and EVERY prepared collection from the
 * same verified block. CodePart addresses are STOP-prefixed byte storage, not Solidity
 * executable runtimes; their complete contents are already checked by verifyDeployment. */
export async function publicationSpecs(provider: Provider, expected: DeploymentExpectation, report: Verification): Promise<SourceSpec[]> {
  const abi = async (name: string) => JSON.parse(await readFile(new URL(`../../packages/contracts/src/${name}.json`, import.meta.url), 'utf8'));
  const at = { blockTag: report.block }, controller = expected.controller;
  const voting = report.contracts.find(c => c.name === 'ManekinekoVotingV14')!.address;
  const renderer = report.contracts.find(c => c.name === 'ManekinekoRendererV11')!.address;
  const v = new Contract(voting, await abi('ManekinekoVotingV14'), provider);
  const c = new Contract(controller, await abi('ManekinekoSeasonControllerV14'), provider);
  const specs: SourceSpec[] = [];
  for (const contract of report.contracts) {
    const base = { name: contract.name, address: contract.address };
    switch (contract.name) {
      case 'ManekinekoV13CodePart': break;
      case 'ManekinekoSeasonControllerV14': specs.push({ ...base, args: [{ ...expected.settings, operator: expected.operator, credits: expected.credits }, expected.options] }); break;
      case 'ManekinekoVotingV14': specs.push({ ...base, args: [controller, expected.settings.bootstrapAllowed] }); break;
      case 'ManekinekoGenesisV14': specs.push({ ...base, args: [controller, voting] }); break;
      case 'ManekinekoRendererV11': specs.push({ ...base, args: [] }); break;
      case 'ManekinekoWinnerCreditsV9': specs.push({ ...base, args: [expected.operator, expected.legacyMerkleRoot, expected.previousRegistry] }); break;
      case 'ManekinekoHolderRewardsV13': case 'ManekinekoRoundDeployerV13': specs.push({ ...base, args: [controller] }); break;
      case 'ManekinekoRoundV13': {
        const ballot = await v.ballots(contract.address, at), id = Number(ballot.sequence), plan = expected.catalog[id - 1];
        if (!plan || String(await c.rounds(id, at)).toLowerCase() !== contract.address.toLowerCase()) throw new Error('Publication collection identity mismatch.');
        const s = expected.settings;
        specs.push({ ...base, args: [[plan.name, plan.symbol, plan.seasonId, plan.seasonName, plan.color, plan.textColor, id, expected.operator, voting, expected.holderRewards, s.coordinator, s.keyHash, s.confirmations, s.callbackGas, 10, ballot.endsAt], renderer] });
        break;
      }
      default: throw new Error('Unrecognized executable contract in publication graph.');
    }
  }
  if (specs.length !== 7 + report.preparedCollections) throw new Error('Incomplete publication graph.');
  return specs;
}
