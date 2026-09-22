import { buildTinctaLinework } from "./tincta-motifs.ts";
export { getTinctaMotif, TINCTA_MOTIF_NAMES } from "./tincta-motifs.ts";
import { contrastTextColor, normalizeCollectionColor } from "./season-appearance.ts";

/** Tincta's V8 artwork. Pure SVG, mirrored byte-for-byte by ManekinekoRendererV8. */
export const TINCTA_ARTWORK_VERSION = "tincta-v2";
export type TinctaArtworkInput = {
  seasonId: string;
  seasonName: string;
  collectionName: string;
  collectionColor: string;
  textColor: "#000000" | "#FFFFFF";
  tokenId: number | bigint;
  state?: "sealed" | "revealed" | "refundable";
  numbers?: readonly number[];
  score?: number | bigint;
  awardRank?: number;
};

const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
// Conservative glyph widths keep even long W/M strings and Unicode names in the 544px column.
const size = (value: string, preferred: number, mono = false) => {
  let units = 0;
  for (const char of value) {
    units += char.codePointAt(0)! > 127 ? 1000 : mono ? 600 : char === " " ? 300
      : "MW@".includes(char) ? 1050 : "mw".includes(char) ? 900 : /[A-Z]/.test(char) ? 850 : 650;
  }
  return Math.min(preferred, Math.floor(540_000 / units));
};
function validName(value: string, max: number) {
  const bytes = new TextEncoder().encode(value);
  if (!bytes.length || bytes.length > max || /[\u0000-\u001f\u007f\ufffe\uffff]/.test(value) || new TextDecoder().decode(bytes) !== value) throw new Error("Invalid artwork name");
}

export function buildTinctaSvg(input: TinctaArtworkInput): string {
  validName(input.seasonName, 64); validName(input.collectionName, 80);
  const color = normalizeCollectionColor(input.collectionColor);
  if (contrastTextColor(color) !== input.textColor) throw new Error("Invalid artwork contrast");
  if (typeof input.tokenId === "number" && !Number.isSafeInteger(input.tokenId)) throw new Error("Invalid artwork token");
  const token = BigInt(input.tokenId);
  if (token < 1n || token > 65_536n) throw new Error("Invalid artwork token");
  const state = input.state ?? "sealed";
  if (!["sealed", "revealed", "refundable"].includes(state)) throw new Error("Invalid artwork state");
  const revealed = state === "revealed";
  const n = input.numbers ?? [];
  const award = input.awardRank ?? 0;
  if (!Number.isInteger(award) || award < 0 || award > 10 || (!revealed && award)) throw new Error("Invalid artwork award");
  if (revealed && (n.length !== 4 || n.some(value => !Number.isInteger(value) || value < 1 || value > 16)
    || input.score === undefined || (typeof input.score === "number" && !Number.isSafeInteger(input.score)) || BigInt(input.score) < 1n || BigInt(input.score) > 65_536n)) throw new Error("Invalid artwork result");

  // Decorative only. These curves never generate, predict or change a competition score.
  const variation = Number((token + (revealed ? BigInt(n[0] * 3 + n[1] * 5 + n[2] * 7 + n[3] * 11) : 0n)) % 3n);
  const lines = buildTinctaLinework(input.seasonId, color, variation);
  const status = state === "refundable" ? "REFUNDABLE" : !revealed ? "SEALED" : award ? "WINNING EDITION" : "REVEALED";
  const note = state === "refundable" ? "Mint not completed" : !revealed ? "Awaiting reveal" : award ? `Award #${award}` : "Verified on-chain";
  let numbers = "";
  for (let i = 0; i < 4; i++) numbers += `<text x="${48 + i * 144}" y="585" font-size="11" letter-spacing="2">${String.fromCharCode(65 + i)}</text><text x="${48 + i * 144}" y="628" font-size="38">${revealed ? n[i] : "--"}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="${color}"/><g fill="${input.textColor}" font-family="sans-serif"><text x="48" y="52" font-size="12" font-weight="500" letter-spacing="3">TINCTA</text><text x="592" y="52" font-family="monospace" font-size="12" text-anchor="end">No. ${token.toString().padStart(4, "0")}</text><text x="48" y="112" font-size="${size(input.seasonName, 30)}" font-weight="500">${escapeXml(input.seasonName)}</text><text x="48" y="148" font-family="monospace" font-size="${size(input.collectionName, 18, true)}">${escapeXml(input.collectionName)}</text><g fill="none" stroke="${input.textColor}" stroke-width="1" opacity="0.6">${lines}</g><path d="M58 202 L70 202 M64 196 L64 208 M570 202 L582 202 M576 196 L576 208 M58 502 L70 502 M64 496 L64 508 M570 502 L582 502 M576 496 L576 508 M48 548 L592 548 M48 742 L592 742" fill="none" stroke="${input.textColor}" stroke-width="1" opacity="0.4"/><g font-family="monospace">${numbers}<text x="48" y="680" font-size="11" letter-spacing="2">SCORE</text><text x="48" y="712" font-size="24">${revealed ? input.score : "--"}</text></g><text x="592" y="680" font-size="11" letter-spacing="1" text-anchor="end">${status}</text><text x="592" y="712" font-size="18" text-anchor="end">${note}</text><text x="48" y="770" font-size="10" letter-spacing="2">COLOR, COLLECTED.</text><text x="592" y="770" font-family="monospace" font-size="10" text-anchor="end">${color}</text></g></svg>`;
}

/** V10 permanent SVG: no lifecycle, final score or prize data can enter the image. */
export const TINCTA_PERMANENT_ARTWORK_VERSION = "tincta-v3";
export type TinctaPermanentArtworkInput = Omit<TinctaArtworkInput, "state" | "score" | "awardRank" | "numbers"> & { numbers: readonly number[]; combinationCode: number | bigint | string };

export function buildTinctaPermanentSvg(input: TinctaPermanentArtworkInput): string {
  validName(input.seasonName, 64); validName(input.collectionName, 80);
  const color = normalizeCollectionColor(input.collectionColor);
  if (contrastTextColor(color) !== input.textColor) throw new Error("Invalid artwork contrast");
  if (typeof input.tokenId === "number" && !Number.isSafeInteger(input.tokenId)) throw new Error("Invalid artwork token");
  const token = BigInt(input.tokenId);
  if (token < 1n || token > 65_536n) throw new Error("Invalid artwork token");
  const n = input.numbers;
  if (n.length !== 4 || n.some(value => !Number.isInteger(value) || value < 1 || value > 16)) throw new Error("Invalid artwork combination");
  const code = n.reduce((packed, value) => (packed << 4) | (value - 1), 0);
  if (String(code) !== String(input.combinationCode)) throw new Error("Invalid artwork combination code");

  // Decorative only. These curves never generate, predict or change a competition score.
  const variation = Number((token + BigInt(n[0] * 3 + n[1] * 5 + n[2] * 7 + n[3] * 11)) % 3n);
  const lines = buildTinctaLinework(input.seasonId, color, variation);
  let numbers = "";
  for (let i = 0; i < 4; i++) numbers += `<text x="${48 + i * 144}" y="585" font-size="11" letter-spacing="2">${String.fromCharCode(65 + i)}</text><text x="${48 + i * 144}" y="628" font-size="38">${n[i]}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="${color}"/><g fill="${input.textColor}" font-family="sans-serif"><text x="48" y="52" font-size="12" font-weight="500" letter-spacing="3">TINCTA</text><text x="592" y="52" font-family="monospace" font-size="12" text-anchor="end">No. ${token.toString().padStart(4, "0")}</text><text x="48" y="112" font-size="${size(input.seasonName, 30)}" font-weight="500">${escapeXml(input.seasonName)}</text><text x="48" y="148" font-family="monospace" font-size="${size(input.collectionName, 18, true)}">${escapeXml(input.collectionName)}</text><g fill="none" stroke="${input.textColor}" stroke-width="1" opacity="0.6">${lines}</g><path d="M58 202 L70 202 M64 196 L64 208 M570 202 L582 202 M576 196 L576 208 M58 502 L70 502 M64 496 L64 508 M570 502 L582 502 M576 496 L576 508 M48 548 L592 548 M48 742 L592 742" fill="none" stroke="${input.textColor}" stroke-width="1" opacity="0.4"/><g font-family="monospace">${numbers}<text x="48" y="680" font-size="11" letter-spacing="2">COMBINATION CODE</text><text x="48" y="712" font-size="24">${code}</text></g><text x="592" y="680" font-size="11" letter-spacing="1" text-anchor="end">PERMANENT EDITION</text><text x="592" y="712" font-size="18" text-anchor="end">Numbers fixed at mint</text><text x="48" y="770" font-size="10" letter-spacing="2">COLOR, COLLECTED.</text><text x="592" y="770" font-family="monospace" font-size="10" text-anchor="end">${color}</text></g></svg>`;
}
