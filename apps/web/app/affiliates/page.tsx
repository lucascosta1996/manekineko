import { SiteShell } from "../../components/site-shell";
import { ProtocolExperience } from "../../components/protocol/protocol-experience";
import { protocolConfig } from "../../lib/protocol/config";
export const metadata = { title: "Affiliate program · Tincta" };
export default function Page() {
  const config = protocolConfig();
  return (
    <SiteShell section="affiliates" chainId={config?.chainId}>
      <ProtocolExperience config={config} view="affiliates" />
    </SiteShell>
  );
}
