/** Shared by the launch preview, API and deployment CLI. No browser or Node-only dependencies. */
export const MAX_SEASON_COLLECTIONS = 10;
export const DEFAULT_COLLECTION_COLOR = "#F6F3E9";
export type SeasonAppearance = {
  seasonId: string;
  seasonName: string;
  collectionColor: string;
  textColor: "#000000" | "#FFFFFF";
};

export function normalizeCollectionColor(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new Error("Collection color must be a six-digit hex color, such as #336699.");
  }
  return value.trim().toUpperCase();
}

/** Choose whichever of black and white has the greater WCAG relative-luminance contrast. */
export function contrastTextColor(value: string): SeasonAppearance["textColor"] {
  const hex = normalizeCollectionColor(value);
  const channels = [1, 3, 5].map(offset => {
    const srgb = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}

export function normalizeSeasonAppearance(input: unknown): SeasonAppearance {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Season appearance is required.");
  const value = input as Record<string, unknown>;
  if (typeof value.seasonId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.seasonId) || /^0x0{64}$/.test(value.seasonId)) {
    throw new Error("Season ID must be a nonzero 32-byte hex value.");
  }
  if (typeof value.seasonName !== "string") throw new Error("Season name is required.");
  const seasonName = value.seasonName.trim();
  if (!seasonName || new TextEncoder().encode(seasonName).length > 64 || /[\u0000-\u001f\u007f\ufffe\uffff]/.test(seasonName)
    || new TextDecoder().decode(new TextEncoder().encode(seasonName)) !== seasonName) {
    throw new Error("Season name must contain 1–64 UTF-8 bytes without control characters.");
  }
  const collectionColor = normalizeCollectionColor(value.collectionColor);
  const textColor = contrastTextColor(collectionColor);
  if (value.textColor !== undefined && value.textColor !== textColor) {
    throw new Error("Text color does not match the collection background's automatic contrast.");
  }
  return { seasonId: value.seasonId.toLowerCase(), seasonName, collectionColor, textColor };
}
