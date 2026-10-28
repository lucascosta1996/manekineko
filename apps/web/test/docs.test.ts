import assert from "node:assert/strict";
import test from "node:test";
import protocolV16Abi from "@manekineko/contract-abi/protocol-v16" with { type: "json" };
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
  assert.ok(searchDocs(entries, "tokenForCombination").some(page => page.slug === "verification"));
});

test("verification documentation names real single-contract collection and holder-pool reads", () => {
  const text = docSearchEntry(docPages.find(page => page.slug === "verification")!).text;
  const functions = new Map(protocolV16Abi.filter(item => item.type === "function").map(item => [item.name, item.stateMutability]));
  for (const name of ["catalogCount", "prepared", "collection", "round", "terms", "winningOption", "mintDeadline", "optionCount", "option", "tokenId", "tokenLocation", "combination", "tokenURI", "tokenForCombination", "score", "awardRank", "awardBeneficiary", "refundsAvailable", "seasons", "holderSummary", "holderClaimed", "ownerOf"]) {
    assert.ok(text.includes(name), name);
    assert.ok(["view", "pure"].includes(functions.get(name) ?? ""), name);
  }
  assert.match(text, /Earlier deployments expose different functions/);
});
test("current guides preserve economic floors, holder claims and deployment boundaries", () => {
  const text = (slug: string) => docSearchEntry(docPages.find(page => page.slug === slug)!).text;
  assert.match(text("onchain-voting"), /0.01 ETH/);
  assert.match(text("onchain-voting"), /1,000–65,536/);
  assert.match(text("onchain-voting"), /3 ETH withdrawable after the successful draw/);
  assert.match(text("affiliates"), /making 30% withdrawable by the operator/);
  assert.match(text("affiliates"), /With one or more qualifiers, the treasury remains 10%/);
  assert.match(text("onchain-voting"), /infrastructure costs, future functionality and Tincta projects/);
  assert.match(text("overview"), /unconfigured deployment is not a live sale/);
  assert.match(text("prizes"), /Only the current holder can claim/);
  assert.match(text("refunds"), /No operator cancellation or approval/);
  assert.match(text("affiliates"), /No server-issued admission permit/);
});

test("diagrams and formulas are included in search and explain the draw's boundaries", () => {
  const entries = docPages.map(docSearchEntry);
  for (const page of docPages) assert.ok(page.sections.some(section => section.blocks.some(block => ['flow', 'formula', 'allocation'].includes(block.type))), page.slug);
  assert.ok(searchDocs(entries, 'modulo bias').some(page => page.slug === 'prizes'));
  assert.ok(searchDocs(entries, 'Feistel').some(page => page.slug === 'verification'));
  assert.ok(searchDocs(entries, 'L =').some(page => page.slug === 'holder-rewards'));
  assert.doesNotMatch(entries.map(entry => entry.text + entry.description).join(' '), /\bV\d+\b/);
  const allocation = docPages[0].sections.flatMap(section => section.blocks).find(block => block.type === 'allocation');
  assert.ok(allocation?.type === 'allocation');
  assert.deepEqual(allocation.items.map(item => item.share), [60, 20, 10, 10]);
  assert.equal(allocation.items.reduce((sum, item) => sum + item.share, 0), 100);
  const holders = entries.find(entry => entry.slug === 'holder-rewards')!.text;
  assert.match(holders, /L is greater than zero/);
  assert.match(holders, /pending transaction does not reserve/);
  assert.match(entries.find(entry => entry.slug === 'prizes')!.text, /does not randomly shuffle all losing NFTs/);
});
