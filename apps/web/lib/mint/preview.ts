import { encodeScrambledRank } from "@manekineko/contract-abi/scrambled-rank";
import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import { encodePermanentCombination } from "@manekineko/contract-abi/permanent-combinations";
import { buildTinctaSvg, buildTinctaPermanentSvg } from "@manekineko/contract-abi/tincta-artwork";
import type { AlgorithmVersion } from "../collections/model.ts";
import type { CollectionPublic } from "../collections/model.ts";

type PreviewAppearance = Pick<CollectionPublic, "name" | "seasonId" | "seasonName" | "collectionColor" | "textColor">;
const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const fittedSize = (value: string, preferred: number) => Math.min(preferred, Math.floor(860 / Math.max(new TextEncoder().encode(value).length, 1)));

/** Illustrative on-chain artwork preview; it never assigns a token or predicts entropy. */
export const EXAMPLE_NUMBERS = [2, 3, 4, 5] as const;
export const EXAMPLE_CODE = 16_909_060n;
export const EXAMPLE_SCORE = 111_686_058_756n;

export function previewExample(algorithmVersion: "unique-rank-v6", maxSupply?: number): { numbers: number[]; score: null };
export function previewExample(algorithmVersion: Exclude<AlgorithmVersion, "unique-rank-v6">, maxSupply?: number): { numbers: number[]; score: bigint };
export function previewExample(algorithmVersion: AlgorithmVersion, maxSupply?: number): { numbers: number[]; score: bigint | null };
export function previewExample(algorithmVersion: AlgorithmVersion, maxSupply = 1000): { numbers: number[]; score: bigint | null } {
  if (algorithmVersion === "feistel-v1") return { numbers: [...EXAMPLE_NUMBERS], score: EXAMPLE_SCORE };
  if (!["unique-rank-v2", "unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(algorithmVersion) || !Number.isInteger(maxSupply) || maxSupply < 1 || maxSupply > 65_536) throw new Error("Invalid preview algorithm or supply");
  if (algorithmVersion === "unique-rank-v6") return { numbers: encodePermanentCombination(1, `0x${"42".repeat(32)}`).numbers, score: null };
  const score = Math.min(1000, maxSupply);
  if (algorithmVersion === "unique-rank-v3" || algorithmVersion === "unique-rank-v4" || algorithmVersion === "unique-rank-v5") {
    // Fixed demonstration key only; actual combinations depend on the revealed collection key.
    const sample = encodeScrambledRank(score, `0x${"42".repeat(32)}`);
    return { numbers: sample.numbers, score: BigInt(sample.score) };
  }
  const code = score - 1;
  return { numbers: [(code >> 12) + 1, ((code >> 8) & 15) + 1, ((code >> 4) & 15) + 1, (code & 15) + 1], score: BigInt(score) };
}

export function buildTicketSvg(
  roundId: string,
  tokenId: number,
  revealedExample = false,
  algorithmVersion: AlgorithmVersion = "feistel-v1",
  maxSupply = 1000,
  appearance?: PreviewAppearance
): string {
  if (!/^\d+$/.test(roundId) || !Number.isSafeInteger(tokenId) || tokenId < 1)
    throw new Error("Invalid preview identifiers");
  if (algorithmVersion === "unique-rank-v6" && (!appearance?.seasonId || tokenId > maxSupply)) throw new Error("A permanent preview requires collection appearance and an in-range token");
  const example = previewExample(algorithmVersion, maxSupply);
  const label = revealedExample ? example.numbers.join(" / ") : appearance?.seasonId ? "Sealed until VRF reveal" : "Sealed until reveal";
  const scoreLine = revealedExample && example.score !== null
    ? `<text x="48" y="380" font-size="18">SCORE ${example.score}</text>`
    : "";
  if (appearance?.seasonId) {
    const terms = normalizeSeasonAppearance(appearance);
    const collectionName = appearance.name;
    if (!collectionName || new TextEncoder().encode(collectionName).length > 80 || /[\u0000-\u001f\u007f]/.test(collectionName)) throw new Error("Invalid collection preview name");
    if (algorithmVersion === "unique-rank-v6") {
      // A demonstration key, never a prediction of an undeployed collection address.
      const identity = encodePermanentCombination(tokenId, `0x${"42".repeat(32)}`);
      return buildTinctaPermanentSvg({ ...terms, collectionName, tokenId, numbers: identity.numbers, combinationCode: identity.combinationCode });
    }
    if (algorithmVersion === "unique-rank-v5") {
      return buildTinctaSvg({
        seasonId: terms.seasonId, seasonName: terms.seasonName, collectionName, collectionColor: terms.collectionColor,
        textColor: terms.textColor, tokenId, state: revealedExample ? "revealed" : "sealed",
        ...(revealedExample ? { numbers: example.numbers, score: example.score! } : {}),
      });
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="${terms.collectionColor}"/><g fill="${terms.textColor}" font-family="monospace"><text x="48" y="80" font-size="${fittedSize(terms.seasonName, 24)}">${escapeXml(terms.seasonName)}</text><text x="48" y="128" font-size="${fittedSize(collectionName, 18)}">${escapeXml(collectionName)}</text><text x="48" y="300" font-size="24">${label}</text>${scoreLine}<text x="48" y="550" font-size="18">TOKEN #${tokenId}</text></g></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" rx="32" fill="#f6f3e9"/><g fill="#173c2c" font-family="monospace"><text x="48" y="80" font-size="24">MANEKINEKO</text><text x="48" y="128" font-size="18">ROUND ${roundId}</text><text x="48" y="300" font-size="24">${label}</text>${scoreLine}<text x="48" y="550" font-size="18">TOKEN #${tokenId}</text></g></svg>`;
}

export function ticketDataUri(
  roundId: string,
  tokenId: number,
  example = false,
  algorithmVersion: AlgorithmVersion = "feistel-v1",
  maxSupply = 1000,
  appearance?: PreviewAppearance
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    buildTicketSvg(roundId, tokenId, example, algorithmVersion, maxSupply, appearance)
  )}`;
}
