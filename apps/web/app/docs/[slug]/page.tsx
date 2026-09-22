import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "../../../components/docs/docs-article";
import { docPages } from "../../../lib/docs/content";

export function generateStaticParams() { return docPages.filter(page => page.slug !== "overview").map(page => ({ slug: page.slug })); }
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = docPages.find(entry => entry.slug === slug);
  return page ? { title: `${page.title} | Tincta Docs`, description: page.description } : { title: "Page not found | Tincta Docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = docPages.find(entry => entry.slug === slug && slug !== "overview");
  if (!page) notFound();
  return <DocsArticle page={page} />;
}
