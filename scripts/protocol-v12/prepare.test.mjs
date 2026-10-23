import test from "node:test";
import assert from "node:assert/strict";
import { prepare, validateOptions } from "./prepare.mjs";
const option = {
  supply: "1000",
  price: "10000000000000000",
  winners: "6",
  duration: "86400",
};
const plan = {
  chainId: "11155111",
  seasonId: "0x" + "11".repeat(32),
  name: "Fictional voting rehearsal",
  steps: [
    {
      payload: {
        contract: {
          chainId: "11155111",
          seasonId: "0x" + "11".repeat(32),
          seasonName: "Fictional voting rehearsal",
          name: "Rehearsal one",
          symbol: "TEST",
          collectionColor: "#330000",
          textColor: "#FFFFFF",
        },
      },
    },
  ],
};
test("exact economics reject sub-floor, lossy numeric inputs and unsupported durations", () => {
  for (const patch of [
    { price: "9999999999999999" },
    { price: 1e16 },
    { winners: "7" },
    { duration: "1800" },
    { supply: "0" },
    { supply: "1" },
    { supply: "999" },
    { supply: "999", price: "100000000000000000" },
    { supply: "65537" },
  ])
    assert.throws(() => validateOptions([{ ...option, ...patch }]));
  assert.equal(validateOptions([option])[0].price, 10n ** 16n);
  assert.throws(() => validateOptions([option, option]));
});
test("supply stays elastic above 1,000 and operator allocation scales with revenue", () => {
  for (const supply of ["1000", "1001", "2000", "65536"]) {
    const [terms] = validateOptions([{ ...option, supply }]);
    assert.equal(terms.supply, BigInt(supply));
  }
  for (const [supply, revenue, operator] of [
    ["1000", 10n, 2n],
    ["2000", 20n, 4n],
  ]) {
    const [terms] = validateOptions([{ ...option, supply }]);
    assert.equal(terms.supply * terms.price, revenue * 10n ** 18n);
    assert.equal(
      (terms.supply * terms.price * 20n) / 100n,
      operator * 10n ** 18n
    );
  }
});
test("offline calldata preserves identities and refuses network relabeling", async () => {
  const input = {
    chainId: 11155111,
    controller: "0x" + "22".repeat(20),
    options: [option],
    plans: [plan],
  };
  const out = await prepare(input);
  assert.equal(out.catalog[0].seasonId, plan.seasonId);
  assert.equal(out.catalog[0].name, "Rehearsal one");
  assert.equal(out.transactions.length, 1);
  await assert.rejects(prepare({ ...input, chainId: 1 }));
  await assert.rejects(
    prepare({ ...input, plans: [{ ...plan, chainId: "1" }] })
  );
});
test("all 22 canonical Mainnet seasons preserve 216 collection identities in bounded upload batches", async () => {
  const { loadNamedSeasonCatalog } = await import("../season-catalog.mjs");
  const { createHash } = await import("node:crypto");
  const catalog = await loadNamedSeasonCatalog();
  const plans = catalog.map((season) => {
    const seasonId = `0x${createHash("sha256")
      .update(`manekineko:seasons.json:chain:1:season:${season.season}`)
      .digest("hex")}`;
    return {
      chainId: "1",
      seasonId,
      name: season.theme,
      steps: season.namedCollections.map((item, i) => ({
        payload: {
          contract: {
            chainId: "1",
            seasonId,
            seasonName: season.theme,
            name: item.name,
            symbol: `TEST${i}`,
            collectionColor: item.color,
            textColor: "#FFFFFF",
          },
        },
      })),
    };
  });
  const out = await prepare({
    chainId: 1,
    controller: "0x" + "22".repeat(20),
    options: [option],
    plans,
  });
  assert.equal(plans.length, 22);
  assert.equal(out.catalog.length, 216);
  assert.equal(out.transactions.length, 22);
  assert.deepEqual(
    out.catalog.map((c) => c.name),
    catalog.flatMap((s) => s.namedCollections.map((c) => c.name))
  );
  assert.deepEqual(
    out.catalog.map((c) => c.color),
    catalog.flatMap((s) => s.collections)
  );
  await assert.rejects(
    prepare({
      chainId: 1,
      controller: out.controller,
      options: [option],
      plans: [plans[1], plans[0], ...plans.slice(2)],
    })
  );
});
