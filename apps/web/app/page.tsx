import { SiteShell } from "../components/site-shell";
import { ProtocolExperience } from "../components/protocol/protocol-experience";
import { protocolConfig } from "../lib/protocol/config";
export const metadata = { title: "Tincta Rewards · Vote, mint, claim" };
export default function Home() {
  const config = protocolConfig();
  return (
    <SiteShell section="home" chainId={config?.chainId}>
      <ProtocolExperience config={config} view="home" />
    </SiteShell>
  );
}
