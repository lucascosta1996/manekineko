import { readFile, writeFile } from "node:fs/promises";
import { TINCTA_MOTIF_DATA } from "../packages/contracts/src/tincta-motifs.ts";

// The reviewed numeric curve definitions are the only source of the packed on-chain table.
const file = new URL("../apps/contracts/contracts/ManekinekoRendererV8.sol", import.meta.url);
const source = await readFile(file, "utf8");
const start = "    // BEGIN GENERATED TINCTA MOTIFS";
const end = "    // END GENERATED TINCTA MOTIFS";
const table = `${start}\n    bytes private constant MOTIFS = hex"${TINCTA_MOTIF_DATA}";\n${end}`;
const pattern = /    \/\/ BEGIN GENERATED TINCTA MOTIFS[\s\S]*?    \/\/ END GENERATED TINCTA MOTIFS/;
if (!pattern.test(source)) throw new Error("Missing motif table markers");
const next = source.replace(pattern, table);
if (process.argv.includes("--check")) {
  if (next !== source) throw new Error("Solidity motif table is out of date");
  console.log("Solidity motif table matches the 22 shared definitions.");
} else {
  await writeFile(file, next);
  console.log("Embedded 22 motifs in ManekinekoRendererV8.sol.");
}
