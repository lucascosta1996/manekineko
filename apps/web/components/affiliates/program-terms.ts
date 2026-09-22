/** Basis points cross the API as integers; display percentages without rounding. */
export function formatBasisPoints(basisPoints: number): string {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error("Invalid collection percentage.");
  const remainder = (basisPoints % 100).toString().padStart(2, "0").replace(/0+$/, "");
  return `${Math.floor(basisPoints / 100)}${remainder ? `.${remainder}` : ""}%`;
}
