"use client";

import { useId } from "react";
import { contrastTextColor, DEFAULT_COLLECTION_COLOR, normalizeCollectionColor } from "@manekineko/contract-abi/season-appearance";
import { buildTinctaSvg, buildTinctaPermanentSvg } from "@manekineko/contract-abi/tincta-artwork";
import { encodePermanentCombination } from "@manekineko/contract-abi/permanent-combinations";
import { encodeScrambledRank } from "@manekineko/contract-abi/scrambled-rank";
import type { LaunchForm } from "./form-values";

export function previewAppearance(color?: string) {
  try { const background = normalizeCollectionColor(color); return { background, text: contrastTextColor(background), valid: true }; }
  catch { return { background: DEFAULT_COLLECTION_COLOR, text: contrastTextColor(DEFAULT_COLLECTION_COLOR), valid: false }; }
}

/** Mirrors each version's immutable artwork. Example numbers are never minted predictions. */
export function CollectionArtworkPreview({ form, compact = false }: { form: LaunchForm; compact?: boolean }) {
  const { background, text } = previewAppearance(form.collectionColor);
  if (form.collectionColor === undefined) return <figure className="season-artwork-preview"><div className="season-historical-artwork"><strong>Original artwork</strong><p>This saved configuration predates named season artwork. Its existing NFT design remains unchanged.</p></div></figure>;
  const season = form.seasonName?.trim() || "Season name";
  const collection = form.name.trim() || "Collection name";
  if (["unique-rank-v5", "unique-rank-v6"].includes(form.algorithmVersion ?? "")) {
    const permanent = form.algorithmVersion === "unique-rank-v6";
    const supply = Number(form.maxSupply);
    const sample = encodeScrambledRank(Number.isSafeInteger(supply) && supply > 0 ? Math.min(supply, 1000) : 1000, `0x${"42".repeat(32)}`);
    let svg: string;
    try {
      svg = permanent ? buildTinctaPermanentSvg({ seasonId: form.seasonId ?? "", seasonName: season, collectionName: collection, collectionColor: background, textColor: text, ...encodePermanentCombination(1, `0x${"42".repeat(32)}`), tokenId: 1 }) : buildTinctaSvg({ seasonId: form.seasonId ?? "", seasonName: season, collectionName: collection, collectionColor: background, textColor: text, tokenId: 1, state: "revealed", numbers: sample.numbers, score: BigInt(sample.score) });
    } catch {
      return <figure className="season-artwork-preview"><div className="season-historical-artwork"><strong>Artwork preview unavailable</strong><p>Set a valid season ID, a season name of up to 64 UTF-8 bytes and a collection name of up to 80 UTF-8 bytes, without control characters.</p></div></figure>;
    }
    return <figure className={`season-artwork-preview${compact ? " is-compact" : ""}`}>
      <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} width="640" height="800" alt={`${season} · ${collection} Tincta NFT artwork preview`} />
      <figcaption>{permanent ? "Permanent artwork preview · sample key, illustrative numbers. Exact numbers depend on the deployed collection address." : "Artwork preview · illustrative numbers and score"}</figcaption>
    </figure>;
  }
  const fittedSize = (name: string, preferred: number) => Math.min(preferred, Math.floor(860 / Math.max(new TextEncoder().encode(name).length, 1)));
  return <figure className={`season-artwork-preview${compact ? " is-compact" : ""}`}>
    <svg viewBox="0 0 640 640" role="img" aria-label={`${season} · ${collection} NFT artwork preview`}>
      <rect width="640" height="640" fill={background} />
      <g fill={text} fontFamily="monospace">
        <text x="48" y="80" fontSize={fittedSize(season, 24)}>{season}</text>
        <text x="48" y="128" fontSize={fittedSize(collection, 18)}>{collection}</text>
        <text x="48" y="300" fontSize="24">7 / 12 / 4 / 15</text>
        <text x="48" y="380" fontSize="18">SCORE 128</text>
        <text x="48" y="550" fontSize="18">TOKEN #1</text>
      </g>
    </svg>
    <figcaption>Artwork preview · illustrative numbers and score</figcaption>
  </figure>;
}

export function SeasonAppearanceFields({ form, disabled, onChange, inheritedSeason = false, showPreview = true }: {
  form: LaunchForm; disabled: boolean; onChange: (next: LaunchForm) => void; inheritedSeason?: boolean; showPreview?: boolean;
}) {
  const id = useId();
  const color = previewAppearance(form.collectionColor);
  if (!form.algorithmVersion) return <p className="launch-context-note">This historical configuration keeps its original artwork. Named season artwork applies to new collections.</p>;
  return <section className="season-appearance" aria-label="Season and NFT appearance">
    <div className="season-appearance-settings">
      <span className="launch-eyebrow">ON-CHAIN IDENTITY</span>
      {inheritedSeason ? <div className="season-inherited-name"><small>Part of this season</small><strong>{form.seasonName || "Name your season above"}</strong><p>The season name appears on every NFT in this group.</p></div> : <>
        <label className="launch-field"><span>Season name</span><input value={form.seasonName ?? ""} onChange={event => onChange({ ...form, seasonName: event.target.value })} disabled={disabled} maxLength={64} placeholder="Crimson & Blood Orange" /><small>The shared name shown on every NFT in this season. Each collection keeps its own creative name and color.</small></label>
        <details className="season-identity-details"><summary>Season identity</summary><label className="launch-field"><span>Season ID</span><input value={form.seasonId ?? ""} onChange={event => onChange({ ...form, seasonId: event.target.value })} disabled={disabled} className="launch-address-input" spellCheck={false} maxLength={66} /><small>Keep the same ID for collections in one season. A season supports up to 10 collections. Use Seasons to manage the complete group.</small></label></details>
      </>}
      <label className="launch-field" htmlFor={`${id}-hex`}><span>Collection color</span></label>
      <div className="season-color-input"><input type="color" aria-label="Choose collection color" value={color.background} onChange={event => onChange({ ...form, collectionColor: event.target.value.toUpperCase() })} disabled={disabled} /><input id={`${id}-hex`} aria-describedby={`${id}-color-hint`} value={form.collectionColor ?? ""} onChange={event => onChange({ ...form, collectionColor: event.target.value })} disabled={disabled} placeholder="#RRGGBB" maxLength={7} spellCheck={false} aria-invalid={!color.valid} /></div>
      <p id={`${id}-color-hint`} className="season-color-hint">{color.valid ? <>This color is the NFT background. Its collection name appears in {color.text === "#FFFFFF" ? "white" : "black"} for contrast. Catalog collections already have their planned colors.</> : "Enter the collection’s six-digit hex color (#RRGGBB)."}</p>
      <span className="season-collection-label" style={{ background: color.background, color: color.text }}>{form.name || "Collection name"}</span>
    </div>
    {showPreview && <CollectionArtworkPreview form={form} />}
  </section>;
}
