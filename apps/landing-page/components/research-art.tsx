import seasons from "../../../seasons.json";

/** Geometric research studies, using the existing catalog's exact palettes. */
export function ResearchArt({ kind }: { kind: "field" | "rewards" | "morph" | "assembly" }) {
  const colors = seasons[kind === "morph" ? 7 : kind === "assembly" ? 14 : 0].collections;
  return (
    <svg viewBox="0 0 560 440" fill="none" aria-hidden="true" focusable="false">
      {kind === "field" && <g transform="translate(280 220)">
        {Array.from({ length: 56 }, (_, i) => <ellipse key={i} rx={170} ry={42 + i * 1.9} transform={`rotate(${i * 3.2})`} stroke={colors[Math.floor(i / 6) % colors.length]} strokeWidth="1.3" />)}
      </g>}
      {kind === "rewards" && <g transform="translate(280 220)">
        {Array.from({ length: 60 }, (_, i) => <ellipse key={i} rx="172" ry="74" transform={`rotate(${i * 6})`} stroke={colors[Math.floor(i / 6) % colors.length]} strokeWidth="1.8" />)}
        <circle r="67" fill="var(--ui-canvas)" />
        <path d="M0-28C0-8-8 0-28 0C-8 0 0 8 0 28C0 8 8 0 28 0C8 0 0-8 0-28Z" stroke="currentColor" strokeWidth="1.5" />
      </g>}
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
