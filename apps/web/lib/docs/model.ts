export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "callout"; title: string; text: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "links"; items: { label: string; description: string; href: string }[] };

export interface DocSection { id: string; title: string; blocks: DocBlock[] }
export interface DocPage {
  slug: string;
  title: string;
  description: string;
  group: string;
  minutes: number;
  sections: DocSection[];
}
export interface DocSearchEntry {
  slug: string;
  title: string;
  description: string;
  group: string;
  text: string;
}

export const docGroups = ["Start here", "The protocol", "Participate", "Reference"];
export const docHref = (slug: string) => slug === "overview" ? "/docs" : `/docs/${slug}`;

export function docSearchEntry(page: DocPage): DocSearchEntry {
  const text = page.sections.flatMap(section => [section.title, ...section.blocks.flatMap(block => {
    switch (block.type) {
      case "paragraph": return [block.text];
      case "callout": return [block.title, block.text];
      case "list": return block.items;
      case "table": return [...block.columns, ...block.rows.flat()];
      case "links": return block.items.flatMap(item => [item.label, item.description]);
    }
  })]).join(" ");
  return { slug: page.slug, title: page.title, description: page.description, group: page.group, text };
}

export function searchDocs(entries: DocSearchEntry[], query: string): DocSearchEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries.map(entry => {
    const title = entry.title.toLocaleLowerCase();
    const description = entry.description.toLocaleLowerCase();
    const body = `${title} ${description} ${entry.text.toLocaleLowerCase()}`;
    const score = terms.every(term => body.includes(term))
      ? terms.reduce((sum, term) => sum + (title.includes(term) ? 6 : description.includes(term) ? 3 : 1), 0) : 0;
    return { entry, score };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).map(result => result.entry);
}
