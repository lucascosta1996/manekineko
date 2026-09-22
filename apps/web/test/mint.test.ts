import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  demoStorageKey,
  mintDemoTickets,
  readDemoState,
  type DemoState,
} from "../lib/mint/demo.ts";
import { formatDuration, formatWei } from "../lib/mint/format.ts";
import {
  buildTicketSvg,
  EXAMPLE_CODE,
  EXAMPLE_NUMBERS,
  EXAMPLE_SCORE,
  ticketDataUri,
} from "../lib/mint/preview.ts";

const collectionId = "8fa5f8c0-6ef4-47f6-9af3-60b8101c9321";
const otherCollectionId = "bd7a641e-125b-4d83-a7ec-9a5c87622002";
const empty: DemoState = {
  version: 1,
  collectionId,
  minted: 0,
  lastQuantity: 0,
};

test("wei amounts preserve every decimal at small and uint256-sized values", () => {
  const cases: [string | bigint, string][] = [
    [0n, "0"],
    [1n, "0.000000000000000001"],
    [2n, "0.000000000000000002"],
    ["10000000000000000", "0.01"],
    ["999999999999999999", "0.999999999999999999"],
    ["1000000000000000001", "1.000000000000000001"],
    [
      "123456789012345678901234567890123456789",
      "123456789012345678901.234567890123456789",
    ],
    [
      (1n << 256n) - 1n,
      "115792089237316195423570985008687907853269984665640564039457.584007913129639935",
    ],
  ];
  for (const [wei, expected] of cases) assert.equal(formatWei(wei), expected);
  assert.equal(formatWei(1n, 6), "0.000001");
  assert.equal(formatWei(1234567n, 6), "1.234567");
  assert.equal(formatWei(99n, 0), "99");
  assert.equal(formatWei(1n, 36), "0.000000000000000000000000000000000001");
});

test("zero and six decimal currencies preserve native precision without phantom fractions", () => {
  for (const amount of [0n, 1n, 99n, (1n << 256n) - 1n]) {
    assert.equal(formatWei(amount, 0), amount.toString());
    assert.doesNotMatch(formatWei(amount, 0), /\./);
  }
  assert.equal(formatWei(999999n, 6), "0.999999");
  assert.equal(formatWei(1000001n, 6), "1.000001");
  assert.equal(formatWei(1000000n, 6), "1");
  assert.equal(
    formatWei(123456789012345678901234567n, 6),
    "123456789012345678901.234567"
  );
});

test("sale duration selects an exact unit instead of rounding hours into days", () => {
  assert.equal(formatDuration(1), "1 second");
  assert.equal(formatDuration(60), "1 minute");
  assert.equal(formatDuration(3600), "1 hour");
  assert.equal(formatDuration(36 * 3600), "36 hours");
  assert.equal(formatDuration(90 * 60), "90 minutes");
  assert.equal(formatDuration(86400), "1 day");
  assert.equal(formatDuration(604800), "7 days");
  assert.equal(formatDuration(86401), "86,401 seconds");
});

test("displayed mint totals and the half-revenue prize stay exact", () => {
  const minimumMintPrice = 2n;
  assert.equal(formatWei(minimumMintPrice * 20n), "0.00000000000000004");
  assert.equal(
    formatWei((minimumMintPrice * 999n) / 2n),
    "0.000000000000000999"
  );
  const fractionalPrice = 10000000000000002n;
  assert.equal(formatWei(fractionalPrice * 20n), "0.20000000000000004");
  assert.equal(formatWei((fractionalPrice * 1000n) / 2n), "5.000000000000001");
});

test("local demo mints respect batch size and the final available ticket", () => {
  const first = mintDemoTickets(empty, 20, 21, 20);
  assert.deepEqual(first, { ...empty, minted: 20, lastQuantity: 20 });
  const soldOut = mintDemoTickets(first, 1, 21, 20);
  assert.deepEqual(soldOut, { ...empty, minted: 21, lastQuantity: 1 });
  assert.throws(
    () => mintDemoTickets(soldOut, 1, 21, 20),
    /available ticket quantity/
  );
  assert.deepEqual(
    empty,
    { version: 1, collectionId, minted: 0, lastQuantity: 0 },
    "minting must not mutate the prior session state"
  );
  assert.deepEqual(
    readDemoState(JSON.stringify(soldOut), collectionId, 21),
    soldOut
  );
});

test("invalid quantities cannot mint demo tickets or exceed contract limits", () => {
  for (const quantity of [
    0,
    -1,
    1.5,
    21,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () => mintDemoTickets(empty, quantity, 65_536, 20),
      /available ticket quantity/
    );
  }
  assert.throws(
    () => mintDemoTickets(empty, 21, 65_536, 100),
    /available ticket quantity/,
    "a larger UI batch setting must not bypass the contract's 20 ticket cap"
  );
  assert.throws(
    () => mintDemoTickets(empty, 6, 10, 5),
    /available ticket quantity/
  );
  assert.throws(
    () => mintDemoTickets({ ...empty, minted: 65_530 }, 7, 65_536, 20),
    /available ticket quantity/
  );
});

test("malformed or stale browser storage resets safely", () => {
  const badRecords: unknown[] = [
    null,
    [],
    "hello",
    42,
    { ...empty, version: 2 },
    { ...empty, minted: -1 },
    { ...empty, minted: 1001 },
    { ...empty, minted: 1.5 },
    { ...empty, minted: "10" },
    { ...empty, minted: Number.MAX_SAFE_INTEGER + 1 },
    { ...empty, minted: 10, lastQuantity: 11 },
    { ...empty, minted: 100, lastQuantity: 21 },
    { ...empty, lastQuantity: -1 },
    { ...empty, lastQuantity: 0.5 },
    { version: 1, collectionId, minted: 10 },
  ];
  for (const value of badRecords)
    assert.deepEqual(
      readDemoState(JSON.stringify(value), collectionId, 1000),
      empty
    );
  for (const raw of [null, "", "{broken", "undefined"])
    assert.deepEqual(readDemoState(raw, collectionId, 1000), empty);
});

test("local mint sessions remain isolated by collection ID", () => {
  const owned = mintDemoTickets(empty, 4, 1000, 20);
  assert.notEqual(
    demoStorageKey(collectionId),
    demoStorageKey(otherCollectionId)
  );
  assert.deepEqual(
    readDemoState(JSON.stringify(owned), otherCollectionId, 1000),
    { ...empty, collectionId: otherCollectionId }
  );
  assert.deepEqual(
    readDemoState(JSON.stringify(owned), collectionId, 1000),
    owned
  );
});

/** Read the actual contract concat expression, so changing its artwork invalidates preview parity. */
function sealedSvgFromSolidity(roundId: string, tokenId: number): string {
  const contract = readFileSync(
    new URL("../../contracts/contracts/ManekinekoRound.sol", import.meta.url),
    "utf8"
  );
  const label = contract.match(
    /string memory label = refundsAvailable\(\) \? "[^"]*" : "([^"]*)";/
  )?.[1];
  const expression = contract.match(
    /string memory svg = string\.concat\(([\s\S]*?)\n\s*\);/
  )?.[1];
  assert.ok(
    label && expression,
    "contract tokenURI structure changed; check the preview against the new implementation"
  );
  const values: Record<string, string> = {
    "roundId.toString()": roundId,
    "tokenId.toString()": String(tokenId),
    label,
    scoreLine: "",
  };
  const tokens =
    /'([^']*)'|roundId\.toString\(\)|tokenId\.toString\(\)|\blabel\b|\bscoreLine\b/g;
  const output: string[] = [];
  let position = 0;
  for (const token of expression.matchAll(tokens)) {
    assert.match(
      expression.slice(position, token.index),
      /^[\s,]*$/,
      "unexpected contract SVG expression requires a deliberate preview review"
    );
    output.push(token[1] ?? values[token[0]]);
    position = token.index + token[0].length;
  }
  assert.match(expression.slice(position), /^[\s,]*$/);
  return output.join("");
}

test("sealed preview is byte-for-byte the Solidity tokenURI SVG", () => {
  for (const [round, token] of [
    ["1", 1],
    ["37", 20],
    [((1n << 256n) - 1n).toString(), 65_536],
  ] as const) {
    assert.equal(
      buildTicketSvg(round, token),
      sealedSvgFromSolidity(round, token)
    );
  }
});

test("preview is deterministic, self-contained SVG and round-trips as a data URI", () => {
  for (const example of [false, true]) {
    const svg = buildTicketSvg("2", 7, example);
    assert.equal(buildTicketSvg("2", 7, example), svg);
    assert.match(
      svg,
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>.*<\/svg>$/
    );
    assert.doesNotMatch(
      svg,
      /<(?:script|image|foreignObject)\b|\b(?:href|src|onload|onclick)=|url\(/i
    );
    assert.equal(
      decodeURIComponent(ticketDataUri("2", 7, example).split(",")[1]),
      svg
    );
    assert.match(svg, /ROUND 2<\/text>/);
    assert.match(svg, /TOKEN #7<\/text>/);
  }
  assert.doesNotMatch(buildTicketSvg("1", 1), /SCORE/);
  assert.match(buildTicketSvg("1", 1), /Sealed until reveal/);
});

test("preview identifiers reject markup injection and invalid token numbers", () => {
  for (const round of [
    "",
    "1</text><script>alert(1)</script>",
    "1&2",
    '1" onload="alert(1)',
    "-1",
    "1.5",
  ]) {
    assert.throws(
      () => buildTicketSvg(round, 1),
      /Invalid preview identifiers/
    );
  }
  for (const token of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () => buildTicketSvg("1", token),
      /Invalid preview identifiers/
    );
  }
});

test("revealed illustration uses the contract's ordered encoding and tie-breaking score", () => {
  const [a, b, c, d] = EXAMPLE_NUMBERS.map(BigInt);
  const code =
    ((a - 1n) << 24n) | ((b - 1n) << 16n) | ((c - 1n) << 8n) | (d - 1n);
  const score = (a * b + c * d) * (1n << 32n) + code;
  assert.equal(EXAMPLE_CODE, code);
  assert.equal(EXAMPLE_SCORE, score);
  assert.equal(a * b + c * d, 26n);
  assert.match(
    buildTicketSvg("1", 1, true),
    new RegExp(`SCORE ${score}</text>`)
  );
  assert.match(buildTicketSvg("1", 1, true), /2 \/ 3 \/ 4 \/ 5/);
});
