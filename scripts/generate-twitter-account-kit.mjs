import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import * as researchModule from "../apps/landing-page/components/research-art.tsx";

// Run with node --import tsx. Next normally supplies the JSX runtime; this
// standalone exporter supplies it for the source component's classic JSX.
globalThis.React = React;
const ResearchArt = researchModule.ResearchArt ?? researchModule.default?.ResearchArt;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "docs/brand/tincta/twitter-account-kit");
const check = process.argv.includes("--check");
const geometry = JSON.parse(await readFile(resolve(root, "docs/brand/tincta/identity/geometry.json"), "utf8"));
const wrap = (viewBox, content, name) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${name}"><title>${name}</title>${content}</svg>\n`;
const white = (x, y, size) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#FFFFFF"/>`;
const accounts = [
  {
    handle: "tinctaxyz", name: "Tincta", artwork: "Main TC Ligature glyph",
    source: "docs/brand/tincta/identity/geometry.json",
    svg: wrap(geometry.mark.viewBox, `${white(0, 0, 100)}<path transform="translate(12 12) scale(.76)" fill="#111111" d="${geometry.mark.path}"/>`, "Tincta profile picture"),
  },
  {
    handle: "tinctarewards", name: "Tincta Rewards", artwork: "Open",
    source: "docs/brand/tincta/rewards-open/tincta-rewards-pfp.svg",
    svg: await readFile(resolve(root, "docs/brand/tincta/rewards-open/tincta-rewards-pfp.svg"), "utf8"),
  },
];
for (const kind of ["morph", "assembly"]) {
  // Render the real source component, then change only its canvas/framing.
  const rendered = renderToStaticMarkup(React.createElement(ResearchArt, { kind }));
  const body = rendered.slice(rendered.indexOf(">") + 1, rendered.lastIndexOf("</svg>"))
    .replaceAll('fill="var(--ui-canvas)"', 'fill="#FFFFFF"');
  const name = `Tincta ${kind === "morph" ? "Morph" : "Assembly"}`;
  accounts.push({
    handle: `tincta${kind}`, name, artwork: kind === "morph" ? "Nested rotating frames" : "Quarter-circle assembly",
    source: "apps/landing-page/components/research-art.tsx + seasons.json",
    svg: wrap("60 0 440 440", `${white(60, 0, 440)}<g fill="none" transform="translate(280 220) scale(.9) translate(-280 -220)">${body}</g>`, `${name} profile picture`),
  });
}

const outputs = new Map();
const verification = [];
for (const account of accounts) {
  const base = `${account.handle}/${account.handle}-pfp`;
  outputs.set(`${base}.svg`, Buffer.from(account.svg));
  for (const size of [400, 1024]) {
    const png = await sharp(Buffer.from(account.svg)).resize(size, size).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let outsideCircle = 0, transparentPixels = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * info.channels;
      if (data[offset + 3] !== 255) transparentPixels++;
      const colored = data[offset] < 245 || data[offset + 1] < 245 || data[offset + 2] < 245;
      if (colored && Math.hypot(x + .5 - size / 2, y + .5 - size / 2) > size / 2 - 1) outsideCircle++;
    }
    if (outsideCircle || transparentPixels || info.width !== size || info.height !== size) throw new Error(`${base}: invalid dimensions, background or circular safe area`);
    const name = `${base}-${size}.png`;
    outputs.set(name, png);
    verification.push({ file: name, width: size, height: size, bytes: png.length, coloredPixelsOutsideCircle: outsideCircle, transparentPixels, sha256: createHash("sha256").update(png).digest("hex") });
  }
}

// A review sheet, not an account upload: circular previews plus actual small sizes.
const panels = accounts.map((account, i) => {
  const svg = account.svg.trim().replace(/^<svg /, '<svg x="28" y="68" width="224" height="224" ');
  const small = [32, 48, 96].map((size, n) => {
    const x = [38, 102, 174][n];
    return `<svg x="${x}" y="${358 - size / 2}" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><clipPath id="small-${i}-${size}"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#small-${i}-${size})">${account.svg.trim().replace(/^<svg /, '<svg width="100" height="100" ')}</g></svg><text x="${x + size / 2}" y="430" text-anchor="middle" font-size="12" fill="#666666">${size} px</text>`;
  }).join("");
  return `<g transform="translate(${32 + i * 300} 28)"><text x="140" y="24" text-anchor="middle" font-size="18" fill="#171717">@${account.handle}</text><defs><clipPath id="avatar-${i}"><circle cx="140" cy="180" r="112"/></clipPath></defs><g clip-path="url(#avatar-${i})">${svg}</g><circle cx="140" cy="180" r="112" fill="none" stroke="#E4E4E4"/>${small}</g>`;
}).join("");
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1264" height="492" viewBox="0 0 1264 492"><rect width="1264" height="492" fill="#FFFFFF"/><g font-family="Helvetica Neue,Arial,sans-serif">${panels}</g></svg>\n`;
outputs.set("preview.svg", Buffer.from(preview));
outputs.set("preview.png", await sharp(Buffer.from(preview)).png().toBuffer());
outputs.set("manifest.json", Buffer.from(JSON.stringify({
  accounts: accounts.map(({ handle, name, artwork, source }) => ({ handle, name, artwork, source })),
  generation: "node --import tsx scripts/generate-twitter-account-kit.mjs",
  framing: "Opaque white square canvases. Existing geometry and colors preserved. Artwork remains inside a circular crop.",
  files: verification,
}, null, 2) + "\n"));
outputs.set("README.md", Buffer.from(`# Tincta — four X / Twitter account PFP kits

| Folder | Artwork |
| --- | --- |
| [tinctaxyz](tinctaxyz/) | Main Tincta TC Ligature glyph |
| [tinctarewards](tinctarewards/) | Approved Open artwork |
| [tinctamorph](tinctamorph/) | Existing Morph artwork from the landing page |
| [tinctaassembly](tinctaassembly/) | Existing Assembly artwork from the landing page |

Each account folder contains (ACCOUNT is the account handle):

- ACCOUNT-pfp-400.png — profile upload file.
- ACCOUNT-pfp-1024.png — larger PNG export.
- ACCOUNT-pfp.svg — editable, scalable vector with the identical framing.

Use the PNG to upload a profile picture. All files have an opaque white square canvas and space for a circular crop. Preserve the square framing: do not crop tightly around the artwork. The parent account uses the main glyph, not the wordmark or Rewards artwork.

The Rewards exports match the approved PFP kit byte for byte. Morph and Assembly are rendered from the actual landing-page component, with their existing catalog colors and geometry; only the outer square framing changes. Their source artwork has not been redesigned.

Open preview.png for the four accounts together with 32, 48 and 96 px circular examples. This preview is a review sheet, not a profile upload. manifest.json records source paths, PNG sizes, hashes and circular-crop checks.

Regenerate from the repository root:

    node --import tsx scripts/generate-twitter-account-kit.mjs
    node --import tsx scripts/generate-twitter-account-kit.mjs --check

No X accounts have been changed by this export.
`));

const mismatches = [];
for (const [name, content] of outputs) {
  const file = resolve(directory, name);
  if (check) {
    const actual = await readFile(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!actual?.equals(content)) mismatches.push(name);
  } else {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}
if (mismatches.length) throw new Error(`Account kit differs from its source: ${mismatches.join(", ")}`);
console.log(`${check ? "Verified" : "Created"} ${outputs.size} files for ${accounts.length} account kits in ${directory}`);
