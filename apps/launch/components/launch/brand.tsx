import { TinctaWordmark } from "../tincta-logo";

export function LaunchBrand({ decorative = false }: { decorative?: boolean }) {
  return <TinctaWordmark className="launch-brand" title={decorative ? "" : "Tincta"} />;
}
