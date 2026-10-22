import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seasons = JSON.parse(await readFile(resolve(here, '../../../../seasons.json'), 'utf8'));
const palettes = { green: seasons[7].collections, blue: seasons[14].collections, warm: seasons[0].collections };
await mkdir(resolve(here, 'sketches'), { recursive: true });
await mkdir(resolve(here, 'references'), { recursive: true });
const n = value => Number(value.toFixed(3));
const wrap = (content, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${label}"><rect width="512" height="512" fill="#fafafa"/>${content}</svg>\n`;
const lineColor = (p, i) => p[Math.floor(i / 3) % p.length];

function morph(p) {
  return `<g transform="translate(256 256)" fill="none">${Array.from({ length: 30 }, (_, i) => `<rect x="${n(-133+i*2.2)}" y="${n(-133+i*2.2)}" width="${n(266-i*4.4)}" height="${n(266-i*4.4)}" rx="${n(i*2.7)}" transform="rotate(${n(-24+i*2.5)})" stroke="${lineColor(p,i)}" stroke-width="2"/>`).join('')}</g>`;
}
function assembly(p) {
  return `<g transform="translate(100 100)">${Array.from({ length: 16 }, (_, i) => `<g transform="translate(${i%4*78} ${Math.floor(i/4)*78})"><path d="M0 0H72V72H0Z" fill="${p[i%p.length]}" opacity="${i===3||i===12?0.12:1}"/><path d="${i%2?'M0 0A72 72 0 0 1 72 72H0Z':'M72 0A72 72 0 0 0 0 72V0Z'}" fill="#fafafa"/></g>`).join('')}</g>`;
}
function drift(p) {
  return `<g transform="translate(256 256)" fill="none">${Array.from({ length: 32 }, (_, i) => {
    const t=i/31,w=286-122*t,h=286-134*t,x=-18+52*t*t,y=15-40*Math.pow(t,1.5),angle=-23+58*t+8*Math.sin(Math.PI*t);
    return `<rect x="${n(-w/2)}" y="${n(-h/2)}" width="${n(w)}" height="${n(h)}" rx="${n(1+75*Math.pow(t,1.6))}" transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})" stroke="${lineColor(p,i)}" stroke-width="2"/>`;
  }).join('')}</g>`;
}
function counterturn(p) {
  return `<g transform="translate(256 256)" fill="none">${Array.from({ length: 32 }, (_, i) => {
    const t=i/31,w=292-136*t,h=292-154*t,angle=-24+54*Math.sin(Math.PI*t),r=70*Math.pow(t,1.2);
    return `<rect x="${n(-w/2)}" y="${n(-h/2)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" transform="rotate(${n(angle)})" stroke="${lineColor(p,i)}" stroke-width="2"/>`;
  }).join('')}</g>`;
}
const quarter='M0 0H72A72 72 0 0 1 0 72Z';
// Every tile stays on Assembly's 78-unit grid, with a 72-unit face and 6-unit gutter.
function tiles(p, specification) {
  return `<g transform="translate(103 103)">${specification.map(([rotation, color, inverse=0], i) => `<g transform="translate(${i%4*78} ${Math.floor(i/4)*78}) rotate(${rotation} 36 36)">${inverse?`<path d="M0 0H72V72H0Z ${quarter}" fill-rule="evenodd" fill="${p[color]}"/>`:`<path d="${quarter}" fill="${p[color]}"/>`}</g>`).join('')}</g>`;
}
function confluence(p) {
  return tiles(p, [
    [0,0],[90,2],[180,8],[270,4],
    [270,4],[180,5],[90,6],[0,1],
    [180,1],[270,6],[0,5],[90,4],
    [90,4],[0,8],[270,2],[180,0],
  ]);
}
function relay(p) {
  return tiles(p, [
    [0,0],[90,1],[0,4,1],[90,2],
    [270,8],[180,5,1],[270,6],[180,4],
    [0,4],[90,6],[0,5,1],[90,8],
    [270,2],[180,4,1],[270,1],[180,0],
  ]);
}
const directions = [
  {id:'a',slug:'drift',name:'Drift',family:'Morph',palette:'green',fn:drift,description:'The square gradually rounds and travels off-center. A drifting aperture gives the familiar contour field a different balance.',rule:'32 frames · moving center · 2-unit strokes'},
  {id:'b',slug:'counterturn',name:'Counterturn',family:'Morph',palette:'green',fn:counterturn,description:'The frames rotate forward, then reverse as they contract. This creates a denser folded edge around a quiet rounded opening.',rule:'32 frames · reversing rotation · 2-unit strokes'},
  {id:'c',slug:'confluence',name:'Confluence',family:'Assembly',palette:'blue',fn:confluence,description:'Quarter-circle tiles form two solid circular groups and two open ones. Positive and negative shapes balance across the same precise grid.',rule:'4 × 4 grid · quarter circles · 6-unit gutters'},
  {id:'d',slug:'relay',name:'Relay',family:'Assembly',palette:'blue',fn:relay,description:'Convex and concave tiles pass a curve through the grid. Alternating solid and open cells create a more directional composition.',rule:'4 × 4 grid · convex/concave pairs · 6-unit gutters'},
];
for (const d of directions) for (const mode of ['family','warm']) {
  await writeFile(resolve(here,`sketches/${d.id}-${d.slug}-${mode}.svg`),wrap(d.fn(palettes[mode==='warm'?'warm':d.palette]),`${d.name}, ${mode==='warm'?'warm Tincta':d.palette} palette`));
}
await writeFile(resolve(here,'references/morph.svg'),wrap(morph(palettes.green),'Existing Tincta Morph artwork'));
await writeFile(resolve(here,'references/assembly.svg'),wrap(assembly(palettes.blue),'Existing Tincta Assembly artwork'));
await writeFile(resolve(here,'directions.json'),JSON.stringify(directions.map(({fn,...d})=>d),null,2)+'\n');
console.log('Generated 8 color SVG sketches and 2 source-derived reference SVGs.');
