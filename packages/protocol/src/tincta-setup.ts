import { Interface } from 'ethers';
import abi from '@manekineko/contract-abi/tincta-rewards' with { type: 'json' };
import type { Catalog } from './progress.ts';
import type { Snapshot } from './chain.ts';
import type { ProtocolConfig } from './config.ts';
import type { OperatorAction } from './operator-actions.ts';
export function catalogPlans(catalog: Catalog) {
  if (catalog.chainId !== 1 || catalog.seasons.length !== 22) throw Error('Use the reviewed Mainnet catalog.');
  const plans = catalog.seasons.flatMap(season => season.collections.map(c => ({ seasonId: season.seasonId, seasonName: season.name, name: c.name, color: c.color, textColor: c.textColor })));
  if (plans.length !== 216) throw Error('The reviewed catalog must contain 216 collections.');
  return plans;
}
export function assertCatalogPrefix(expected: Catalog, actual: Catalog) {
  const target = catalogPlans(expected), existing = actual.seasons.flatMap(s => s.collections.map(c => ({ seasonId: s.seasonId, seasonName: s.name, name: c.name, color: c.color, textColor: c.textColor })));
  if (actual.chainId !== 1 || existing.length > target.length || existing.some((p, i) => JSON.stringify(p) !== JSON.stringify(target[i]))) throw Error('The uploaded catalog differs from the reviewed names, order or colors. Setup is blocked.');
}
export function tinctaSetupActions(state: Snapshot, config: ProtocolConfig, catalog?: Catalog | null): OperatorAction[] {
  if (config.version !== 18 || state.sealed || !catalog) return [];
  const plans = catalogPlans(catalog), iface = new Interface(abi);
  const action = (id: string, title: string, description: string, method: string, args: unknown[] = [], value = 0n): OperatorAction => ({ id, title, description, operatorOnly: true, secondary: false, request: { to: config.controller, data: iface.encodeFunctionData(method, args), value } });
  if (state.catalogCount < plans.length) {
    const batch = plans.slice(state.catalogCount, state.catalogCount + 10);
    return [action(`catalog-${state.catalogCount}`, `Upload collections ${state.catalogCount + 1}–${state.catalogCount + batch.length}`, `Append ${batch.map(p => p.name).join(', ')} in the reviewed catalog order. Genesis stays closed.`, 'appendCollections', [batch])];
  }
  if (state.catalogCount !== plans.length) throw Error('Unexpected catalog length.');
  if (state.operatingBalance < state.cost) return [action('initial-funding', 'Fund the first collection', 'Reserve 0.25 ETH for randomness, 0.20 ETH for sponsored mints and 0.01 ETH for execution. Only the missing balance is sent. Genesis stays closed.', 'fundOperating', [], state.cost - state.operatingBalance)];
  return [action('open-genesis', 'Approve opening Genesis', 'Permanently seal the 22-season, 216-collection catalog and open the free Genesis mint. Verify public app publication and the Mainnet X sender before approving. Genesis has no deadline; its last mint starts the first 24-hour ballot.', 'sealCatalog')];
}
