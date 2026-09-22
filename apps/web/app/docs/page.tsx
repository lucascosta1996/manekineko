import type { Metadata } from "next";
import { DocsArticle } from "../../components/docs/docs-article";
import { docPages } from "../../lib/docs/content";

export const metadata: Metadata = { title: "Documentation | Tincta", description: "A guide to Tincta’s V10 architecture: permanent NFT numbers, the post-sellout VRF draw, prizes and original collection rules." };

export default function DocsPage() {
  return <DocsArticle page={docPages.find(page => page.slug === "overview")!} />;
}
