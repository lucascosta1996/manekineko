import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { renderSeasonSocialSvg } from '../../../packages/contracts/src/season-social-image.ts';
import type { SeasonSocialMessage } from '../../../packages/contracts/src/season-social.ts';

/** Runtime code must not depend on the operator scripts excluded by .vercelignore. */
export async function renderSenderImage(message: SeasonSocialMessage) {
  const png=await sharp(Buffer.from(renderSeasonSocialSvg(message))).png().toBuffer();
  return {png,sha256:createHash('sha256').update(png).digest('hex')};
}
