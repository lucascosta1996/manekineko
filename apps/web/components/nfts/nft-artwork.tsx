"use client";

import { useEffect, useRef, useState } from "react";
import type { NftItem } from "../../lib/nfts/model";
import type { NftMetadata } from "../../lib/nfts/metadata";

export type NftArtworkResponse = NftMetadata & { nft: NftItem };

export function useNftMetadata(item: NftItem, enabled = true, live = false) {
  const [data, setData] = useState<NftArtworkResponse | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = `${item.collectionId}/${item.tokenId}`;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (inFlight || disposed) return;
      inFlight = true; controller = new AbortController();
      try {
        const response = await fetch(`/api/nfts/${key}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        if (!response.ok) throw new Error();
        const result = await response.json() as NftArtworkResponse;
        if (result.collectionId !== item.collectionId || result.tokenId !== item.tokenId || !["available", "burned"].includes(result.status)) throw new Error();
        if (!disposed) { setData(result); setError(false); }
      } catch { if (!disposed) setError(true); }
      finally { inFlight = false; }
    };
    void load();
    const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine) void load(); };
    const timer = live ? setInterval(refresh, 30_000) : null;
    if (live) { window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh); }
    return () => { disposed = true; controller?.abort(); if (timer) clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [key, item.collectionId, item.tokenId, item.phase, item.revealed, item.refunded, enabled, live, attempt]);
  const current = data?.collectionId === item.collectionId && data.tokenId === item.tokenId
    && (live || (data.nft.phase === item.phase && data.nft.refunded === item.refunded && data.nft.revealed === item.revealed));
  return { data: current ? data : null, error, retry: () => setAttempt((value) => value + 1) };
}

export function useArtworkVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "240px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

export function NftArt({ item, data, error, retry }: { item: NftItem; data: NftArtworkResponse | null; error: boolean; retry: () => void }) {
  const portrait = (item.contractVersion === "affiliate-v8" || item.contractVersion === "affiliate-v9" || item.contractVersion === "affiliate-v10");
  if (data?.image) return <img src={data.image} width="640" height={portrait ? "800" : "640"} alt={`Ticket #${item.tokenId}${data.numbers ? ` · ${data.numbers.join(", ")}${data.score ? ` · score ${data.score}` : item.phase === "refundable" ? " · no draw" : " · draw pending"}` : item.phase === "refundable" ? " · refundable on-chain artwork" : " · sealed on-chain artwork"}`} decoding="async" />;
  return <div className="nft-art-placeholder" style={{ aspectRatio: portrait ? "4 / 5" : "1" }}>
    <span className="nft-art-symbol" aria-hidden="true">◇</span>
    <span>{item.currentOwner === null || data?.status === "burned" ? "This ticket was burned" : error ? "Artwork unavailable" : "Loading on-chain artwork"}</span>
    {error && item.currentOwner !== null && <button type="button" className="text-button" onClick={retry}>Try again</button>}
  </div>;
}

export function NftNumbers({ data, revealed, permanent = false }: { data: NftArtworkResponse | null; revealed: boolean; permanent?: boolean }) {
  return <div className="nft-numbers" aria-label={data?.numbers ? `Combination: ${data.numbers.join(", ")}` : revealed || permanent ? "Loading on-chain numbers" : "Numbers sealed until reveal"}>
    {(data?.numbers ?? [null, null, null, null]).map((number, index) => <span key={index} aria-hidden="true">{number ?? (revealed || permanent ? "—" : "?")}</span>)}
  </div>;
}
