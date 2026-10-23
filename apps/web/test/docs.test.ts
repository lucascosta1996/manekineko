import assert from "node:assert/strict";
import test from "node:test";
import roundV12Abi from "@manekineko/contract-abi/round-v12" with { type: "json" };
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
  assert.ok(searchDocs(entries, "gas").some(page => page.slug === "quickstart"));
  assert.ok(searchDocs(entries, "holder prize").some(page => page.slug === "prizes"));
  assert.ok(searchDocs(entries, "snapshot").some(page => page.slug === "onchain-voting"));
  assert.ok(searchDocs(entries, "scoreCombination").some(page => page.slug === "verification"));
});

test("verification documentation names real V12 read functions", () => {
  const text = docSearchEntry(docPages.find(page => page.slug === "verification")!).text;
  const functions = new Map(roundV12Abi.filter(item => item.type === "function").map(item => [item.name, item.stateMutability]));
  for (const name of ["maxSupply", "mintPrice", "totalMinted", "mintDeadline", "phase", "winningTokenIds", "prizeClaimed", "affiliateClaimable", "refundsAvailable", "operatorWithdrawable", "protectedBalance", "combination", "tokenIdForCombination", "tokenURI", "score", "scoreCombination"]) {
    assert.ok(text.includes(name));
    assert.ok(["view", "pure"].includes(functions.get(name) ?? ""));
  }
});
test("current guides preserve economic floors, holder claims and deployment boundaries", () => {
  const text = (slug: string) => docSearchEntry(docPages.find(page => page.slug === slug)!).text;
  assert.match(text("onchain-voting"), /0.01 ETH/);
  assert.match(text("onchain-voting"), /1,000–65,536/);
  assert.match(text("onchain-voting"), /operator percentage stays 20%/);
  assert.match(text("overview"), /unconfigured deployment is not a live sale/);
  assert.match(text("prizes"), /Only the current holder can claim/);
  assert.match(text("refunds"), /No operator cancellation or approval/);
  assert.match(text("affiliates"), /No server-issued admission permit/);
});
