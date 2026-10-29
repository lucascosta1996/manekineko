'use client';
import { useState } from 'react';
import { formatEther } from 'ethers';
import { Button } from '@manekineko/ui/button';
import { Disclosure } from '@manekineko/ui/components';
import { Field, Input } from '@manekineko/ui/forms';
import type { Snapshot } from './chain';
import type { Catalog } from './progress';
import { phaseLabel } from './progress';
import type { OperatorAction } from './operator-actions';
import { CollectionTiming } from './collection-timing';
export function OperatorWorkspace({ state, catalog, disabled, operator, actions, onAction, onSelect, onFundDraw, stale = false }: {
  state: Snapshot | null; catalog: Catalog | null; disabled: boolean; operator: boolean;
  actions: OperatorAction[]; onAction: (action: OperatorAction) => void; onSelect: (id: number) => void;
  onFundDraw: (amount: string) => void;
  stale?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [drawFunding, setDrawFunding] = useState('');
  const r = state?.round;
  const beforeGenesisSellout = !!state?.genesis && (state.genesis.version === 16 || state.genesis.version === 17) && state.genesis.soldOutAt === 0n;
  const network = catalog?.chainId === 1 ? 'Ethereum Mainnet' : catalog?.chainId === 11155111 ? 'Sepolia testnet' : 'Network';
  const selectedPhase = r?.phase ?? state?.latestPhase;
  const primary = actions.filter(action => !action.secondary);
  const secondary = actions.filter(action => action.secondary);
  const actionList = (items: OperatorAction[]) => <ol className="operator-action-list">{items.map(action => <li key={action.id}>
    <h3>{action.title}</h3><p>{action.description}</p><p className="protocol-note">{action.operatorOnly ? 'Operator wallet' : 'Permissionless transaction'}</p>
    {action.operatorOnly && !operator && <p className="protocol-note">Connect the fixed operator wallet to approve this action.</p>}
    <Button variant="secondary" disabled={disabled || (action.operatorOnly && !operator)} onClick={() => onAction(action)}>Review transaction</Button>
  </li>)}</ol>;
  let index = 0;
  const seasons = catalog?.seasons.map((season, seasonIndex) => ({ ...season, number: seasonIndex + 1, collections: season.collections.map(c => ({ ...c, index: ++index })) })) ?? [];
  const filtered = seasons.filter(s => `${s.name} ${s.collections.map(c => c.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const current = seasons.find(s => s.collections.some(c => c.index === state?.count));
  const active = current?.collections.find(c => c.index === state?.count);
  return <div className="operator-workspace">
    <section className="operator-position" aria-labelledby="position-title">
      <p className="protocol-eyebrow" id="position-title">Current onchain position</p>
      <h2>{beforeGenesisSellout ? 'Genesis free mint' : state ? active?.name ?? (state.count ? 'Loading catalog…' : state.genesis && !state.canPrepare ? 'Genesis free mint' : 'Ready for the first collection') : 'Deployment not connected'}</h2>
      <p>{network} · {beforeGenesisSellout ? state?.genesis?.open ? 'Genesis is live. The first paid ballot starts at sellout.' : 'Genesis has not opened yet.' : state ? `${current?.name ?? 'Catalog'} · ${state.count ? phaseLabel[state.latestPhase ?? 0] : state.sealed ? 'Catalog sealed' : 'Catalog setup required'}` : 'The catalog below is a preparation plan. It does not represent live collections or pending wallet approvals.'}</p>
      {state && <dl className="operator-metrics"><div><dt>Collections prepared</dt><dd>{state.count} / {state.catalogCount}</dd></div><div><dt>Operating funds</dt><dd>{formatEther(state.operatingBalance)} ETH</dd></div><div><dt>Next preparation</dt><dd>{formatEther(state.cost)} ETH + gas</dd></div></dl>}
    </section>
    {(state?.genesis?.version===16||state?.genesis?.version===17)&&!r?<section className="protocol-panel"><h2>Before the first season</h2><p>Tincta Genesis · {String(state.genesis.minted)} / {state.genesis.supply.toLocaleString('en-US')} minted · two lifetime free mints per wallet.</p><p>{state.sealed?"Genesis minting has no deadline. The final mint opens the first ballot for its full voting duration.":"The catalog is uploaded and unsealed. Genesis minting and the rehearsal have not started."}</p><p className="protocol-note">Genesis votes only on the first paid ballot and qualifies for affiliate enrollment throughout every collection and season. It is outside the season holder pool.</p></section>:state?.genesis && !state.count && <section className="protocol-panel"><h2>Before the first season</h2><p>Tincta Genesis · {String(state.genesis.minted)} / 1,000 minted · one free mint per wallet.</p><p>{state.genesis.end ? `Free mint ends ${new Date(Number(state.genesis.end) * 1000).toLocaleString()}.` : "The 24-hour free mint opens when the catalog is sealed."} The first paid collection can be prepared after this window ends, including if the free mint sells out early.</p><p className="protocol-note">Genesis NFTs vote only on the first paid ballot. They are outside the season catalog and holder pool.</p></section>}
    <div className="operator-columns">
      <section className="operator-queue" aria-labelledby="signatures-title">
        <div className="operator-section-heading"><h2 id="signatures-title">Actions to review</h2><span>{state ? primary.length : '—'}</span></div>
        {r && <p className="protocol-note">Collection actions: {r.name}. Select an earlier prepared collection to check its remaining withdrawals.</p>}
        {state?.round && <CollectionTiming state={state} stale={stale} />}
        {!state ? <p>No verified deployment. Signing becomes available after the network and contract are configured.</p> : !state.sealed ? <p>The catalog has not been sealed. Complete the reviewed deployment and catalog upload before preparing a collection.</p> : primary.length === 0 ? <p>{beforeGenesisSellout ? 'No operator action is required. The first paid ballot opens automatically when Genesis sells out.' : selectedPhase === 3 ? 'Waiting for verified randomness. No signature is needed from you.' : selectedPhase === 0 ? 'Voting is open or scheduled. Minting opens at the published deadline without your signature.' : selectedPhase === 1 ? 'Minting is live. No operator approval is needed, and this collection cannot be paused.' : 'No action is currently required.'}</p> : actionList(primary)}
        {secondary.length > 0 && <Disclosure title={`Individual actions & fund recovery (${secondary.length})`}>
          <p className="protocol-note">These are separate transactions. Permissionless preparation and draw processing remain available. Recoveries are optional and never use protected prize, affiliate or refund funds.</p>
          {actionList(secondary)}
        </Disclosure>}
        {r && [2, 3].includes(r.phase) && <Disclosure title="Add draw funding">
          <p>Add ETH if Chainlink needs more funding before the cutoff. Only a request that never succeeded may be retried; an accepted request cannot be replaced. Funding never extends the deadline. Mint proceeds remain reserved.</p>
          <Field label="Additional funding (ETH)">{p => <Input {...p} inputMode="decimal" value={drawFunding} onChange={e => setDrawFunding(e.target.value)} placeholder="0.01" />}</Field>
          <Button variant="secondary" disabled={disabled || !drawFunding.trim()} onClick={() => onFundDraw(drawFunding)}>Review draw funding</Button>
        </Disclosure>}
        {state && <p className="protocol-note">Read at block {state.block}. Wallet prompts open only after you review an action.</p>}
      </section>
      <section className="operator-tree" aria-labelledby="tree-title">
        <div className="operator-section-heading"><h2 id="tree-title">Seasons & collections</h2><span>{seasons.length} {seasons.length === 1 ? 'season' : 'seasons'}</span></div>
        <Field label="Search seasons and collections">{p => <Input {...p} value={query} onChange={e => setQuery(e.target.value)} type="search" />}</Field>
        {!catalog ? <p role="status">Reading the contract catalog…</p> : !filtered.length ? <p>No seasons match your search.</p> : <ol className="operator-season-list">{filtered.map(season => {
          const isCurrent = !beforeGenesisSellout && season.seasonId === current?.seasonId;
          const prepared = season.collections.filter(c => c.index <= (state?.count ?? 0)).length;
          return <li key={season.seasonId}><Disclosure open={isCurrent || (!state && season.number === 1) || !!query} title={<span className="operator-season-title"><span>{String(season.number).padStart(2, '0')} · {season.name}</span><span>{state ? `${prepared}/${season.collections.length} prepared${isCurrent ? ' · Current' : ''}` : `${season.collections.length} planned`}</span></span>}>
            <ol className="operator-collection-list">{season.collections.map(c => {
              const prepared = !!state && c.index <= state.count, current = !beforeGenesisSellout && c.index === state?.count;
              const status = !state ? 'Not deployed' : beforeGenesisSellout && c.index === 1 ? 'Waiting for Genesis sellout' : current ? phaseLabel[state.latestPhase ?? 0] : prepared ? 'Prepared · view settlement' : 'Upcoming';
              return <li key={c.index} aria-current={current ? 'step' : undefined}>
                <span className="operator-tree-mark" aria-hidden="true" />
                <div><span className="protocol-note">Collection {c.index}</span><strong>{c.name}</strong><span className="protocol-note">{status}</span></div>
                {prepared && <Button variant="ghost" disabled={disabled && !state} aria-label={`View ${c.name}`} aria-pressed={r?.id === c.index} onClick={() => onSelect(c.index)}>View</Button>}
              </li>;
            })}</ol>
          </Disclosure></li>;
        })}</ol>}
      </section>
    </div>
  </div>;
}
