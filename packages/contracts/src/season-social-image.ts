import { buildTinctaLinework } from "./tincta-motifs.ts";
import { contrastTextColor } from "./season-appearance.ts";
import type { SeasonSocialMessage } from "./season-social.ts";

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const pad = (n: number) => String(n).padStart(2, "0");
const css = '<style>text{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}.mono{font-family:"SFMono-Regular","SF Mono",Menlo,"Liberation Mono",monospace}</style>';
function contrast(color: string, foreground: string) {
  const c = [1, 3, 5].map(offset => { const n = parseInt(color.slice(offset, offset + 2), 16) / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; });
  const luminance = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  return foreground === "#FFFFFF" ? 1.05 / (luminance + 0.05) : (luminance + 0.05) / 0.05;
}
/** A deliberately conservative glyph budget, then SVG textLength as the hard
 * width boundary. This keeps arbitrary frozen names inside the approved frame
 * without browser canvas, filesystem fonts, native addons or catalog lookups. */
function typography(value: string, preferred: number, maxWidth: number, spacing: number, mono = false) {
  const units = [...value].reduce((sum, char) => sum + (mono ? 0.64 : /[MW@%]/.test(char) ? 0.98 : /[ilI.,' :!]/.test(char) ? 0.34 : char.codePointAt(0)! > 255 ? 1 : 0.65), 0);
  const estimated = units * preferred + Math.max(0, [...value].length - 1) * spacing;
  const size = Math.min(preferred, Math.floor(preferred * maxWidth / Math.max(1, estimated)));
  return `font-size="${Math.max(12, size)}"${estimated > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : ""}`;
}

/** Preserves the approved 1600x900 white frame, ordered palette and stable
 * motif. Preview is explicit; Sepolia is always visibly labeled as a test. */
export function renderSeasonSocialSvg(message: SeasonSocialMessage, options: { preview?: boolean } = {}): string {
  const { season, collection } = message;
  const brand = message.chainId === 11155111 ? "Color study" : "Tincta";
  const upcoming = message.event === "upcoming-season", stats = message.event === "season-complete";
  const bands = season.colors.map((color, index) => ({ color, index, x: 48 + Math.round(index * 1504 / season.colors.length), width: Math.round((index + 1) * 1504 / season.colors.length) - Math.round(index * 1504 / season.colors.length), foreground: contrastTextColor(color) }));
  const titleColors = bands.filter(band => band.x < 1200).map(band => band.color);
  const titleForeground = ["#FFFFFF", "#000000"].find(foreground => titleColors.every(color => contrast(color, foreground) >= 3));
  const paths = buildTinctaLinework(season.id, upcoming || stats ? season.colors[0] : collection!.color, 0);
  const serial = `SEASON ${pad(season.number)}${upcoming || stats ? "" : ` / COLLECTION ${pad(collection!.number)}`}`;
  const marker = [options.preview ? "DESIGN PREVIEW" : "", message.chainId === 11155111 ? "SEPOLIA TEST · TEST ETH" : ""].filter(Boolean).join(" · ");
  const heading = message.headline.map((line, index) => `<text x="104" y="${upcoming ? (message.headline.length === 1 ? 636 : 506 + index * 146) : stats ? 438 + index * 136 : 506 + index * 142}" ${typography(line, upcoming ? 138 : stats ? 122 : 134, upcoming ? 1320 : index === 0 ? 738 : 1030, upcoming ? -5 : -4)} font-weight="500" letter-spacing="${upcoming ? -5 : -4}">${xml(line)}</text>`).join("");
  const palette = bands.map(band => `<g clip-path="url(#band-${band.index})">
    <rect x="${band.x}" y="132" width="${band.width}" height="640" fill="${band.color}"/>
    <g transform="translate(1190 356) scale(2.2) translate(-320 -350)" fill="none" stroke="${band.foreground}" stroke-width="0.8" opacity="0.48">${paths}</g>
    <g fill="${band.foreground}">
      <text x="104" y="211" class="mono" font-size="23" letter-spacing="2">${serial}</text>
      ${upcoming ? "" : `<text x="104" y="${stats ? 276 : 258}" ${typography(season.name, stats ? 36 : 26, 736, -0.4)} letter-spacing="-0.4">${xml(season.name)}</text>`}
      ${upcoming || stats ? "" : `<text x="104" y="311" ${typography(collection!.name, 42, 736, -1)} font-weight="500" letter-spacing="-1">${xml(collection!.name)}</text>`}
      ${message.detail ? `<text x="104" y="700" class="mono" ${typography(message.detail, 20, 1320, 0.3, true)} letter-spacing="0.3">${xml(message.detail)}</text>` : ""}
      ${message.metrics.map((metric, index) => `<text x="${104 + index * 366}" y="664" ${typography(metric.value, 44, 286, -1)} font-weight="500" letter-spacing="-1">${xml(metric.value)}</text><text x="${104 + index * 366}" y="702" class="mono" ${typography(metric.label, 16, 286, 0.3, true)} letter-spacing="0.3">${xml(metric.label)}</text>`).join("")}
      <text x="${band.x + band.width / 2}" y="${upcoming ? 735 : 740}" text-anchor="middle" class="mono" font-size="17" letter-spacing="1" opacity="0.8">${pad(band.index + 1)}</text>
      ${!upcoming && !stats && band.index === collection!.number - 1 ? `<path d="M${band.x + band.width / 2 - 15} 750h30" stroke="${band.foreground}" stroke-width="2"/>` : ""}
    </g><g fill="${titleForeground ?? band.foreground}">${heading}</g>
  </g>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title description">
    <title id="title">${xml(`${brand} — ${message.header} — Season ${pad(season.number)}`)}</title><desc id="description">${xml(`${options.preview ? "Design preview. " : ""}${message.alt}`)}</desc>
    <defs>${bands.map(band => `<clipPath id="band-${band.index}"><rect x="${band.x}" y="132" width="${band.width}" height="640"/></clipPath>`).join("")}</defs>
    ${css}<rect width="1600" height="900" fill="#FFFFFF"/>
    <text x="48" y="88" fill="#111111" font-size="49" font-weight="600" letter-spacing="-3">${xml(brand)}</text>
    <text x="1552" y="82" text-anchor="end" fill="#111111" class="mono" font-size="20" letter-spacing="2">${xml(message.header)}</text>
    ${marker ? `<text x="1552" y="111" text-anchor="end" fill="#71717A" class="mono" font-size="12" letter-spacing="1">${xml(marker)}</text>` : ""}
    ${palette}
    <text x="48" y="847" fill="#111111" ${typography(message.footer, 23, 1200, -0.4)} letter-spacing="-0.4">${xml(message.footer)}</text>
    <text x="1552" y="847" text-anchor="end" fill="#111111" class="mono" font-size="21">${message.chainId === 11155111 ? "SEPOLIA" : "tincta.xyz"}</text>
  </svg>\n`;
}
