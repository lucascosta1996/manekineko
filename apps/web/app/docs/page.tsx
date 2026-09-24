import type { Metadata } from "next";
import { DocsArticle } from "../../components/docs/docs-article";
import { docPages } from "../../lib/docs/content";

export const metadata: Metadata = { title: "How rewards work | Tincta", description: "Understand Tincta prizes, affiliate rewards, protected funds, and direct contract claims. Each collection keeps its original rules." };

export default function DocsPage() {
  return <DocsArticle page={docPages.find(page => page.slug === "overview")!} />;
}
