import { createHash } from "node:crypto";
import sharp from "sharp";
import { renderSeasonSocialSvg } from "../../packages/contracts/src/season-social-image.ts";
import type { SeasonSocialMessage } from "../../packages/contracts/src/season-social.ts";

export { renderSeasonSocialSvg };
export async function renderSeasonSocialImage(message: SeasonSocialMessage, options: { preview?: boolean } = {}) {
  const svg = renderSeasonSocialSvg(message, options);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { svg, png, sha256: createHash("sha256").update(png).digest("hex"), width: 1600, height: 900 };
}
