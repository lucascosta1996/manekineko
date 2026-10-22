import { RewardsArtwork } from "@manekineko/ui/rewards-artwork";
import seasons from "../../../seasons.json";

/** Approved Rewards artwork; Morph and Assembly retain their catalog studies. */
export function ResearchArt({ kind }: { kind: "rewards" | "morph" | "assembly" }) {
  if (kind === "rewards") return <RewardsArtwork title="" />;
  const colors = seasons[kind === "morph" ? 7 : kind === "assembly" ? 14 : 0].collections;
  return (
    <svg viewBox="0 0 560 440" fill="none" aria-hidden="true" focusable="false">
      {kind === "morph" && <g transform="translate(280 220)">
        {Array.from({ length: 30 }, (_, i) => <rect key={i} x={-133 + i * 2.2} y={-133 + i * 2.2} width={266 - i * 4.4} height={266 - i * 4.4} rx={i * 2.7} transform={`rotate(${-24 + i * 2.5})`} stroke={colors[Math.floor(i / 3) % colors.length]} strokeWidth="2" />)}
      </g>}
      {kind === "assembly" && <g transform="translate(124 64)">
        {Array.from({ length: 16 }, (_, i) => <g key={i} transform={`translate(${(i % 4) * 78} ${Math.floor(i / 4) * 78})`}>
          <path d="M0 0H72V72H0Z" fill={colors[i % colors.length]} opacity={i === 3 || i === 12 ? 0.12 : 1} />
          <path d={i % 2 ? "M0 0A72 72 0 0 1 72 72H0Z" : "M72 0A72 72 0 0 0 0 72V0Z"} fill="var(--ui-canvas)" />
        </g>)}
      </g>}
    </svg>
  );
}
