/** V7/V8 enrollment closes at the fixed opening, even if activation is delayed. */
export function enrollmentWindowClosed(version: string, start: string | Date | null | undefined, nowSeconds: number): boolean {
  if (!["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(version)) return false;
  const timestamp = start instanceof Date ? start.getTime() : Date.parse(start ?? "");
  return !Number.isFinite(timestamp) || nowSeconds * 1000 >= timestamp;
}
