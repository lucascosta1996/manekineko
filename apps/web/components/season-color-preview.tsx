import type { ReactNode } from "react";

export function SeasonColorBar({ colors }: { colors: readonly string[] }) {
  return <div className="season-swatches" role="img" aria-label={`Season palette: ${colors.join(", ")}`}>
    {colors.map((color, index) => <span key={`${index}:${color}`} title={color} style={{ backgroundColor: color }} />)}
  </div>;
}

export function SeasonColorStack({ colors, children }: { colors: readonly string[]; children?: ReactNode }) {
  return <div className="season-color-stack">
    {colors[2] && <div className="season-color-layer season-color-layer-third" style={{ backgroundColor: colors[2] }} aria-hidden="true" />}
    {colors[1] && <div className="season-color-layer season-color-layer-second" style={{ backgroundColor: colors[1] }} aria-hidden="true" />}
    {children ?? <div className="season-color-front" style={{ backgroundColor: colors[0] }} role="img" aria-label={`Upcoming color preview: ${colors.slice(0, 3).join(", ")}`} />}
  </div>;
}
