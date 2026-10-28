"use client";
import { useEffect, useRef, useState } from 'react';
import { Field } from '@manekineko/ui/forms';
import { CompactSelect } from '@manekineko/ui/select';
import { LinkButton } from '@manekineko/ui/button';
import type { Catalog } from '@manekineko/protocol/progress';
import { previewMessage, COPY, GENESIS_STAGES, COLLECTION_STAGES, SEASON_STAGES } from '@manekineko/contract-abi/v16-social-preview';
import type { Stage } from '@manekineko/contract-abi/v16-social-content';

export function SocialPreview({ catalog }: { catalog: Catalog }) {
  const [id, setId] = useState(0), [stage, setStage] = useState<Stage>('genesis-open');
  const stages = id === 0 ? GENESIS_STAGES : [...COLLECTION_STAGES, ...SEASON_STAGES];
  const content = previewMessage(catalog, id, stage);
  const query = new URLSearchParams({ chainId: String(catalog.chainId), collection: String(id), stage });
  const imageUrl = `/api/social-preview?${query}`;
  // Keep option IDs pure: Field's render callback can run more than once in Strict Mode.
  const collections = catalog.seasons.flatMap((season, seasonIndex) => season.collections.map(collection => ({ season, seasonIndex, collection })));
  return <section className="social-preview" aria-labelledby="social-title">
    <div><h1 id="social-title">X posts & images</h1><p>Review Genesis and every season’s collection images in the published catalog order. These are illustrative previews of the same templates used by the posting worker.</p><p className="social-preview-note">Design preview · {catalog.chainId === 1 ? 'Mainnet is not deployed.' : 'Sepolia testnet; test ETH.'} Previewing sends no posts or transactions.</p></div>
    <div className="social-preview-fields">
      <Field label="Collection">{p => <CompactSelect {...p} value={String(id)} onChange={event => { const next = Number(event.target.value); setId(next); setStage(next === 0 ? 'genesis-open' : 'voting'); }}>
        <option value="0">Tincta Genesis · Free collection</option>
        {collections.map(({ season, seasonIndex, collection }, index) => <option key={index + 1} value={index + 1}>{seasonIndex + 1}. {season.name} · {collection.name}</option>)}
      </CompactSelect>}</Field>
      <Field label="Event">{p => <CompactSelect {...p} value={stage} onChange={event => setStage(event.target.value as Stage)}>{stages.map(item => <option key={item} value={item}>{COPY[item].label}</option>)}</CompactSelect>}</Field>
    </div>
    <figure className="social-preview-image"><PreviewImage key={imageUrl} src={imageUrl} alt={`Design preview. ${content.alt}`} /><figcaption>{content.header} · 1600 × 900</figcaption></figure>
    <div className="social-preview-copy"><h2>Post text</h2><p>{content.post}</p><LinkButton href={`${imageUrl}&format=png`} download={`tincta-${catalog.chainId}-${id}-${stage}.png`} variant="secondary">Download PNG</LinkButton></div>
    <p className="social-preview-note">Genesis sellout starts the first collection’s ballot immediately. Paid minting opens when that ballot ends. The worker publishes only after observing finalized chain state.</p>
  </section>;
}

function PreviewImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  useEffect(() => {
    // A cached image can finish or fail before React attaches its event handlers.
    if (ref.current?.complete) setStatus(ref.current.naturalWidth ? 'loaded' : 'error');
  }, []);
  return <div className="social-preview-frame" data-status={status}>
    {status !== 'error' && <img ref={ref} src={src} width={1600} height={900} alt={alt} onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />}
    {status === 'loading' && <div className="social-preview-feedback" role="status">Loading image preview…</div>}
    {status === 'error' && <div className="social-preview-feedback" role="status"><p>Image preview unavailable.</p><LinkButton href={src} target="_blank" variant="secondary">Open image</LinkButton></div>}
  </div>;
}
