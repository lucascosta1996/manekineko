import { SiteShell } from "../../components/site-shell";
import { ProtocolExperience } from "../../components/protocol/protocol-experience";
import { protocolConfig } from "../../lib/protocol/config";
export const metadata = { title: "Season holder rewards · Tincta", description: "Follow the 8% season pool and settlement progress. Equal rewards for the first 5% of eligible NFTs to claim after season end; amounts vary by season." };
export default function Page() {
  const config = protocolConfig();
  return (
    <SiteShell section="holders" chainId={config?.chainId}>
      <ProtocolExperience config={config} view="holders" />
    </SiteShell>
  );
}
