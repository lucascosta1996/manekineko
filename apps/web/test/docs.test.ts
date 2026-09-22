import assert from "node:assert/strict";
import test from "node:test";
import roundV10Abi from "@manekineko/contract-abi/round-v10" with { type: "json" };
import { docPages } from "../lib/docs/content.ts";
import { docGroups, docHref, docSearchEntry, searchDocs } from "../lib/docs/model.ts";

test("every docs page and section has a unique navigable route or anchor", () => {
  assert.equal(new Set(docPages.map(page => page.slug)).size, docPages.length);
  assert.equal(docPages[0].slug, "overview");
  const routes = new Set(docPages.map(page => docHref(page.slug)));
  for (const page of docPages) {
    assert.match(page.slug, /^[a-z0-9-]+$/);
    assert.ok(docGroups.includes(page.group), page.title);
    assert.ok(page.title && page.description && page.minutes > 0);
    assert.ok(page.sections.length > 0);
    assert.equal(new Set(page.sections.map(section => section.id)).size, page.sections.length, page.slug);
    for (const section of page.sections) {
      assert.match(section.id, /^[a-z0-9-]+$/);
      assert.notEqual(section.id, "docs-title");
      assert.ok(section.title && section.blocks.length);
      for (const block of section.blocks) {
        if (block.type === "table") for (const row of block.rows) assert.equal(row.length, block.columns.length);
        if (block.type !== "links") continue;
        for (const link of block.items) {
          assert.ok(link.href.startsWith("/") || link.href.startsWith("https://"));
          if (!link.href.startsWith("/docs")) continue;
          const [path, hash] = link.href.split("#");
          assert.ok(routes.has(path), `${page.slug}: missing ${path}`);
          if (hash) assert.ok(docPages.find(candidate => docHref(candidate.slug) === path)?.sections.some(candidate => candidate.id === hash), link.href);
        }
      }
    }
  }
});

test("documentation search finds page titles and explanations without a server request", () => {
  const entries = docPages.map(docSearchEntry);
  assert.equal(searchDocs(entries, "").length, 0);
  assert.equal(searchDocs(entries, "    ").length, 0);
  assert.equal(searchDocs(entries, "xyzzy-no-page-8675309").length, 0);
  const affiliate = entries.find(page => page.slug === "affiliates")!;
  assert.equal(searchDocs(entries, affiliate.title)[0]?.slug, "affiliates");
  const refund = entries.find(page => page.slug === "refunds")!;
  assert.equal(searchDocs(entries, refund.title.toUpperCase())[0]?.slug, "refunds");
  assert.ok(searchDocs(entries, "gas").some(page => page.slug === "minting"));
  assert.ok(searchDocs(entries, "holder prize").some(page => page.slug === "prizes"));
  assert.ok(searchDocs(entries, "permanent numbers").some(page => page.slug === "randomness"));
  assert.ok(searchDocs(entries, "V8/V9 sealed").some(page => page.slug === "faq"));
  assert.ok(searchDocs(entries, "scoreCombination").some(page => page.slug === "verification"));
});

test("verification docs link identity and score checks to actual V10 read functions", () => {
  const reads = docPages.find(page => page.slug === "verification")!.sections.find(section => section.id === "useful-contract-reads")!;
  const table = reads.blocks.find(block => block.type === "table")!;
  const functions = new Map(roundV10Abi.filter(item => item.type === "function").map(item => [item.name, item.stateMutability]));
  const documented = new Set<string>();
  for (const [, expression] of table.rows) {
    for (const call of expression.split(";")[0].split(/, | or /)) {
      const name = call.replace(/\([^)]*\)/g, "");
      assert.ok(["view", "pure"].includes(functions.get(name) ?? ""), `Documented read ${name} must exist and require no transaction`);
      documented.add(name);
    }
  }
  for (const name of ["CONTRACT_VERSION", "ALGORITHM_VERSION", "combination", "tokenIdForCombination", "score", "scoreCombination", "revealed", "prizeClaimed"]) {
    assert.ok(documented.has(name), `${name} is needed to verify identity and results separately`);
  }
});

test("V10 docs preserve rollout, pending-result and explorer boundaries", () => {
  const text = (slug: string) => docSearchEntry(docPages.find(page => page.slug === slug)!).text;
  assert.match(text("overview"), /V10 rollout is pending.*no live V10 deployment is recorded/);
  assert.match(text("verification"), /result = 0.*pending/);
  assert.match(text("verification"), /RevealNotAvailable/);
  assert.match(text("my-nfts"), /metadata deliberately omits score, award rank, prize and status/);
  assert.match(text("my-nfts"), /immediate display is not guaranteed/);
  assert.match(text("randomness"), /V8\/V9 derive their four numbers from the final score after the draw/);
});
