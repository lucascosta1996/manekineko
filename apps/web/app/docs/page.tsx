import type { Metadata } from "next";
import { DocsArticle } from "../../components/docs/docs-article";
import { docPages } from "../../lib/docs/content";

export const metadata: Metadata = { title: "How rewards work | Tincta", description: "Understand V13’s 60/20/8/12 allocation, dynamic season holder rewards, limited claims and protected refunds. Existing collections keep their original rules." };

export default function DocsPage() {
  return <DocsArticle page={docPages.find(page => page.slug === "overview")!} />;
}
