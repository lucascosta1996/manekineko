"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import artwork from "./rewards-machine-artwork.json";
import { arcPoint, clamp, machineFrame, MACHINE_DURATION, stepTime, type MachinePhase } from "./rewards-machine-motion";
import styles from "./rewards-machine.module.css";

const wallets = ["0xA1…9F22", "0x72…0B41", "0xE8…6D03"];
type Point = { x: number; y: number };

function Bucket({ vrf = false }: { vrf?: boolean }) {
  return <div className={`${styles.bucketGroup} ${vrf ? styles.vrf : styles.pool}`} data-machine-bucket={vrf ? "vrf" : "prizes"}>
    <div className={styles.bucket}>
      <div className={styles.bucketBody}><div className={styles.liquid} data-machine-fill={vrf ? undefined : "prizes"} /></div>
      {vrf && <><span className={styles.proofRing} /><span className={`${styles.proofRing} ${styles.secondRing}`} /></>}
      <div className={styles.bucketName}>{vrf ? "Chainlink" : "ETH"}<span>{vrf ? "VRF · randomness" : "Prize pool"}</span></div>
    </div>
    <span className={styles.bucketCaption}>{vrf ? "One post-sellout request" : "60% of mint revenue"}</span>
  </div>;
}

export function RewardsMachine() {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<MachinePhase>("winners");

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const element = container;
    const scene = element.querySelector<HTMLElement>("[data-machine-scene]")!;
    const mintRows = [...element.querySelectorAll<HTMLElement>("[data-machine-wallet]")];
    const minted = [...element.querySelectorAll<HTMLElement>("[data-machine-minted]")];
    const winners = [...element.querySelectorAll<HTMLElement>("[data-machine-winner]")];
    const mintedLabels = [...element.querySelectorAll<HTMLElement>("[data-machine-mint-label]")];
    const claimedLabels = [...element.querySelectorAll<HTMLElement>("[data-machine-claimed]")];
    const coins = [...element.querySelectorAll<HTMLElement>("[data-machine-coin]")];
    const proof = element.querySelector<HTMLElement>("[data-machine-proof]")!;
    const fill = element.querySelector<HTMLElement>('[data-machine-fill="prizes"]')!;
    const buckets = [...element.querySelectorAll<HTMLElement>("[data-machine-bucket]")];
    const svg = element.querySelector<SVGSVGElement>("[data-machine-routes]")!;
    const paths = [...svg.querySelectorAll("path")];
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let time = stepTime("winners"), previous = 0, raf = 0, visible = false;
    let lastPhase: MachinePhase = "winners";
    let sources: Point[] = [], targets: Point[] = [], pool: Point = { x: 0, y: 0 }, vrf: Point = pool;

    function measure() {
      // Remove transient translations while reading the stable scene geometry.
      const transforms = winners.map((node) => node.style.translate);
      winners.forEach((node) => { node.style.translate = "none"; });
      const rect = scene.getBoundingClientRect();
      const center = (node: HTMLElement): Point => { const box = node.getBoundingClientRect(); return { x: box.x - rect.x + box.width / 2, y: box.y - rect.y + box.height / 2 }; };
      sources = mintRows.map(center); targets = winners.map(center);
      pool = center(buckets[0].firstElementChild as HTMLElement); vrf = center(buckets[1].firstElementChild as HTMLElement);
      winners.forEach((node, i) => { node.style.translate = transforms[i]; });
      svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      const curve = (a: Point, b: Point) => `M${a.x},${a.y} C${a.x + (b.x-a.x)*.45},${a.y} ${b.x - (b.x-a.x)*.45},${b.y} ${b.x},${b.y}`;
      paths[0].setAttribute("d", sources.map((point) => curve(point, pool)).join(" "));
      paths[1].setAttribute("d", curve({x:pool.x,y:pool.y-40},{x:vrf.x,y:vrf.y-40}));
      paths[2].setAttribute("d", targets.map((point) => curve(vrf, point)).join(" "));
    }
    function particle(node: HTMLElement, from: Point, to: Point, p: number, lift = 40) {
      const point = arcPoint(from, to, p, lift);
      node.style.transform = `translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%) rotate(${p * 160}deg)`;
      node.style.opacity = String(p <= 0 || p >= 1 ? 0 : Math.min(1, p*10, (1-p)*10));
    }
    function paint() {
      const frame = machineFrame(time);
      element.dataset.phase = frame.phase;
      element.dataset.prizeFill = frame.prizeFill.toFixed(3);
      if (frame.phase !== lastPhase) { lastPhase = frame.phase; setPhase(frame.phase); }
      fill.style.setProperty("--prize-fill", String(frame.prizeFill));
      coins.forEach((coin) => { coin.style.opacity = "0"; }); proof.style.opacity = "0";
      minted.forEach((node, index) => {
        const p = frame.phase === "mint" ? clamp((frame.progress-index*.21)/.15) : 1;
        node.style.opacity = String(p);
        node.style.translate = preference.matches ? "none" : `${(1-p)*-16}px ${(1-p)*20}px`;
        mintedLabels[index].textContent = p === 1 ? "2 NFTs minted" : "Minting an NFT";
      });
      winners.forEach((node, index) => {
        const revealed = frame.phase === "claims" ? 1 : frame.phase === "winners" ? clamp((frame.progress-index*.095)/.24) : 0;
        const easing = 1-Math.pow(1-revealed,3);
        node.style.opacity = String(revealed);
        node.style.translate = preference.matches || !targets[index] ? "none" : `${(vrf.x-targets[index].x)*(1-easing)}px ${(vrf.y-targets[index].y)*(1-easing)}px`;
        const claimed = frame.claims[index] >= 1;
        node.dataset.claimed = String(claimed);
        claimedLabels[index].textContent = claimed ? "Claimed" : "";
        if (!preference.matches && frame.phase === "claims" && targets[index]) particle(coins[index], pool, targets[index], frame.claims[index], 55);
      });
      if (preference.matches || !sources.length) return;
      if (frame.phase === "mint") coins.forEach((coin, i) => {
        const p = clamp((frame.progress-i*.068)/.25);
        particle(coin,sources[i%3],{x:pool.x,y:pool.y-40},p,45);
      });
      if (frame.phase === "vrf") particle(proof,{x:pool.x,y:pool.y-50},{x:vrf.x,y:vrf.y-45},frame.progress,48);
      element.style.setProperty("--proof-turn", `${frame.phase === "vrf" ? frame.progress*180 : 0}deg`);
    }
    function frame(now: number) {
      if (previous) time = (time + Math.min(now-previous, 100)) % MACHINE_DURATION;
      previous = now; paint(); raf = requestAnimationFrame(frame);
    }
    function sync() {
      cancelAnimationFrame(raf); previous = 0;
      const active = visible && !document.hidden && !preference.matches;
      element.dataset.motion = active ? "running" : "paused";
      if (active) raf = requestAnimationFrame(frame);
    }
    function preferenceChanged() {
      time = preference.matches ? stepTime("winners") : 0;
      paint();
      sync();
    }
    const resize = new ResizeObserver(() => { measure(); paint(); }); resize.observe(scene);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }); intersection.observe(scene);
    document.addEventListener("visibilitychange", sync);
    preference.addEventListener("change", preferenceChanged);
    measure();
    if (!preference.matches) time = 0;
    paint(); sync();
    return () => { cancelAnimationFrame(raf); resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", sync); preference.removeEventListener("change", preferenceChanged); };
  }, []);

  return <div ref={root} className={styles.machine} data-rewards-machine="" data-phase="winners" data-motion="paused" data-prize-fill="1.000">
    <div className={styles.scene} data-machine-scene="" role="img" aria-label="Illustrative paid collection: wallets mint permanent numbered NFTs; 60% of mint revenue enters the prize pool; after sellout Chainlink VRF supplies randomness; six winning NFTs are revealed; their holders submit claims and the prize pool empties. Other allocations are separate.">
      <div className={styles.floorClip}><div className={styles.floor} /></div>
      <svg className={styles.routes} data-machine-routes="" aria-hidden="true"><path /><path /><path /></svg>
      <div className={styles.wallets}>
        {wallets.map((wallet, index) => <div className={styles.mintRow} key={wallet} data-machine-wallet="" style={{ "--wallet-index": index } as CSSProperties}>
          <div className={styles.wallet}><div className={styles.walletIdentity}><span className={styles.identicon} /><span>{wallet}</span></div><span className={styles.mintLabel} data-machine-mint-label="">2 NFTs minted</span></div>
          <div className={styles.minted} data-machine-minted=""><img src={artwork[index+3].image} width="640" height="800" alt="" draggable="false" /><img src={artwork[index].image} width="640" height="800" alt="" draggable="false" /></div>
        </div>)}
      </div>
      <div className={styles.buckets}><Bucket /><Bucket vrf /></div>
      <div className={styles.results}>
        <div className={styles.winners}>
          {artwork.map((nft, index) => <div className={styles.winner} key={nft.tokenId} data-machine-winner={nft.tokenId} data-claimed="false">
            <div className={styles.nftCrop}><img src={nft.image} width="640" height="800" alt="" draggable="false" /></div>
            <strong>NFT #{nft.tokenId}</strong>
            <span className={styles.numbers}>{nft.numbers.map((number, i) => <span key={i}>{number}</span>)}</span>
            <span className={styles.owner}>{wallets[index%3]}</span>
            <span className={styles.claimed} data-machine-claimed="" />
          </div>)}
        </div>
        <span className={styles.resultLabel}>{phase === "claims" ? "Equal prizes · claimed by NFT holders" : "6 winning NFTs · holders can claim"}</span>
      </div>
      {Array.from({length:9},(_,index)=><span key={index} className={styles.coin} data-machine-coin="" aria-hidden="true">Ξ</span>)}
      <span className={styles.proof} data-machine-proof="" aria-hidden="true" />
    </div>
  </div>;
}
