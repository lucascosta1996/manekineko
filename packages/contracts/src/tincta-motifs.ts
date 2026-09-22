import { sha256, toUtf8Bytes } from "ethers";

/** Original cubic-curve studies, in seasons.json order. Four independent cubics per motif.
 * Each cubic is [startX,startY,control1X,control1Y,control2X,control2Y,endX,endY].
 * Coordinates are authored in a 0..200 square, then fitted into the NFT's ornament area.
 */
export const TINCTA_MOTIFS = [
  { name: "Ember bloom", curves: [[100,100,0,0,0,200,100,100],[100,100,200,0,200,200,100,100],[100,100,0,0,200,0,100,100],[100,100,0,200,200,200,100,100]] },
  { name: "Terracotta arcade", curves: [[10,190,10,80,30,10,100,10],[100,10,170,10,190,80,190,190],[190,190,170,190,150,190,130,190],[70,190,50,190,30,190,10,190]] },
  { name: "Dune current", curves: [[0,135,35,0,60,0,100,100],[100,100,140,200,165,200,200,65],[0,100,30,50,70,60,100,100],[100,100,140,150,175,150,200,100]] },
  { name: "Solar halo", curves: [[100,0,155,0,200,45,200,100],[200,100,200,155,155,200,100,200],[100,200,45,200,0,155,0,100],[0,100,0,45,45,0,100,0]] },
  { name: "Olive spindle", curves: [[100,0,90,60,0,80,0,140],[0,140,0,190,70,200,100,200],[100,200,110,140,200,120,200,60],[200,60,200,10,130,0,100,0]] },
  { name: "Chartreuse pulse", curves: [[100,0,100,90,100,90,200,100],[200,100,110,100,110,100,100,200],[100,200,100,110,100,110,0,100],[0,100,90,100,90,100,100,0]] },
  { name: "Meadow fan", curves: [[100,200,0,160,0,0,30,0],[100,200,35,140,50,20,80,10],[100,200,165,140,150,20,120,10],[100,200,200,160,200,0,170,0]] },
  { name: "Pine chevrons", curves: [[0,100,30,70,70,30,100,0],[100,0,130,30,170,70,200,100],[0,200,30,170,70,130,100,100],[100,100,130,130,170,170,200,200]] },
  { name: "Jade knot", curves: [[100,100,50,0,0,0,0,100],[0,100,0,200,50,200,100,100],[100,100,150,0,200,0,200,100],[200,100,200,200,150,200,100,100]] },
  { name: "Tidal gyre", curves: [[100,100,125,75,150,100,150,125],[150,125,150,175,50,175,50,50],[50,50,50,0,200,0,200,100],[200,100,200,200,0,200,0,0]] },
  { name: "Cyan interference", curves: [[0,20,60,40,140,160,200,180],[0,180,60,160,140,40,200,20],[0,60,80,180,120,20,200,140],[0,140,80,20,120,180,200,60]] },
  { name: "Glacier facets", curves: [[100,0,133,33,166,66,200,100],[200,100,166,133,133,166,100,200],[100,200,66,166,33,133,0,100],[0,100,33,66,66,33,100,0]] },
  { name: "Sky ribbons", curves: [[20,0,200,20,0,180,180,200],[40,0,190,30,10,170,160,200],[60,0,180,40,20,160,140,200],[80,0,170,50,30,150,120,200]] },
  { name: "Cobalt crescent", curves: [[160,0,50,0,0,60,0,100],[0,100,0,160,100,200,160,200],[160,200,90,180,60,170,60,100],[60,100,60,40,110,30,160,0]] },
  { name: "Midnight vault", curves: [[60,10,90,10,110,10,140,10],[140,10,200,10,200,190,140,190],[140,190,110,190,90,190,60,190],[60,190,0,190,0,10,60,10]] },
  { name: "Violet triad", curves: [[100,0,120,60,140,90,200,160],[200,160,130,160,70,160,0,160],[0,160,60,100,80,50,100,0],[100,0,100,50,100,100,100,150]] },
  { name: "Amethyst crown", curves: [[0,180,0,150,0,0,60,40],[60,40,60,80,80,90,100,0],[100,0,120,90,140,80,140,40],[140,40,200,0,200,150,200,180]] },
  { name: "Orchid heart", curves: [[100,50,100,0,0,0,0,100],[0,100,0,140,60,180,100,200],[100,200,140,180,200,140,200,100],[200,100,200,0,100,0,100,50]] },
  { name: "Fuchsia butterfly", curves: [[0,20,120,20,120,180,200,180],[200,180,80,180,80,20,0,20],[200,20,80,20,80,180,0,180],[0,180,120,180,120,20,200,20]] },
  { name: "Coral scallop", curves: [[100,20,200,0,200,0,180,100],[180,100,200,200,200,200,100,180],[100,180,0,200,0,200,20,100],[20,100,0,0,0,0,100,20]] },
  { name: "Blush weave", curves: [[0,40,60,70,140,10,200,40],[0,160,60,130,140,190,200,160],[40,0,70,100,10,100,40,200],[160,0,130,100,190,100,160,200]] },
  { name: "Zenith lattice", curves: [[0,0,66,0,133,0,200,0],[200,0,200,66,200,133,200,200],[200,200,133,200,66,200,0,200],[0,200,0,133,0,66,0,0]] },
] as const;

export const TINCTA_MOTIF_NAMES: readonly string[] = TINCTA_MOTIFS.map(motif => motif.name);
const catalogIds = new Map<string, number>();
for (let i = 0; i < TINCTA_MOTIFS.length; i++) for (const chain of [1, 11155111]) {
  catalogIds.set(sha256(toUtf8Bytes(`manekineko:seasons.json:chain:${chain}:season:${i + 1}`)), i);
}

/** Stable identities survive draft renames; Mainnet and Sepolia use the same catalog motif. */
export function getTinctaMotif(seasonId: string): number {
  if (!/^0x[0-9a-fA-F]{64}$/.test(seasonId) || /^0x0{64}$/.test(seasonId)) throw new Error("Invalid artwork season ID");
  return catalogIds.get(seasonId.toLowerCase()) ?? Number(BigInt(seasonId) % BigInt(TINCTA_MOTIFS.length));
}

/** Packed curve constants are embedded in Solidity by scripts/generate-tincta-motifs.mjs. */
export const TINCTA_MOTIF_DATA = TINCTA_MOTIFS.flatMap(motif => motif.curves.flat()).map(value => value.toString(16).padStart(2, "0")).join("");

/** Integer arithmetic mirrors Solidity (signed division truncates towards zero). */
export function buildTinctaLinework(seasonId: string, color: string, tokenVariation: number): string {
  const curves = TINCTA_MOTIFS[getTinctaMotif(seasonId)].curves;
  const red = parseInt(color.slice(1, 3), 16), green = parseInt(color.slice(3, 5), 16), blue = parseInt(color.slice(5, 7), 16);
  const shear = Math.floor(blue / 16) - 8;
  let lines = "";
  for (let layer = 0; layer < 16; layer++) {
    const scale = 60 + layer * 3;
    const sx = Math.floor((180 + Math.floor(red / 8) + tokenVariation) * scale / 100);
    const sy = Math.floor((112 + Math.floor(green / 12)) * scale / 100);
    let path = "";
    for (const curve of curves) {
      for (let i = 0; i < 8; i += 2) {
        const px = curve[i] - 100, py = curve[i + 1] - 100;
        const x = 320 + Math.trunc(px * sx / 100) + Math.trunc(py * shear / 100);
        const y = 350 + Math.trunc(py * sy / 100);
        path += `${i === 0 ? (path ? " M" : "M") : i === 2 ? " C" : " "}${x} ${y}`;
      }
    }
    lines += `<path d="${path}"/>`;
  }
  return lines;
}
