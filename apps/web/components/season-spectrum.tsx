"use client";

import { useEffect, useState } from "react";
import seasons from "../../../seasons.json";

const palettes = seasons.filter(season => season.collections.length === 10);

export function SeasonSpectrum() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const updatePlayback = () => {
      clearInterval(timer);
      timer = undefined;
      if (reducedMotion.matches || document.hidden) return;
      timer = setInterval(() => setIndex(current => (current + 1) % palettes.length), 1_000);
    };
    updatePlayback();
    reducedMotion.addEventListener("change", updatePlayback);
    document.addEventListener("visibilitychange", updatePlayback);
    return () => {
      clearInterval(timer);
      reducedMotion.removeEventListener("change", updatePlayback);
      document.removeEventListener("visibilitychange", updatePlayback);
    };
  }, []);

  const season = palettes[index];
  return <div className="catalog-spectrum" aria-hidden="true" title={season.theme} data-season={season.season}>
    {season.collections.map((color, position) => <i key={position} style={{ backgroundColor: color }} />)}
  </div>;
}
