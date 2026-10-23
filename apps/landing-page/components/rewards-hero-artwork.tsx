"use client";

import { RewardsArtwork } from "@manekineko/ui/rewards-artwork";
import { useEffect, useRef, useState } from "react";

export function RewardsHeroArtwork() {
  const container = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let visible = false;
    const sync = () => setRunning(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div className="hero-art" ref={container} data-motion={running ? "running" : "paused"}>
      <RewardsArtwork className="rewards-hero-artwork" title="" />
    </div>
  );
}
