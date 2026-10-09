import { RewardsBrand } from "@manekineko/ui/rewards-brand";
import { TinctaWordmark } from "../tincta-logo";

export function LaunchBrand({ decorative = false }: { decorative?: boolean }) {
  return <RewardsBrand decorative={decorative}><TinctaWordmark className="launch-brand" title="" /></RewardsBrand>;
}
