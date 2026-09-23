import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';

// Original vector studies. No application assets, catalog records, or network writes.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const catalog = JSON.parse(await readFile(resolve(root, 'seasons.json'), 'utf8'));
const ink = '#1A1A1A', muted = '#696963', line = '#DADAD3', paper = '#FAFAF7';
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const signature = `<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="butt" stroke-linejoin="round">
  <path d="M15 5V53Q15 65 29 65H34M2 25H35M51 25V66M73 66V25M73 41C73 20 111 20 111 42V66M159 33C143 18 125 27 125 46C125 65 144 75 160 60M179 5V53Q179 65 193 65H198M166 25H199M250 35C235 15 210 24 210 46C210 68 236 76 250 57M250 25V66"/>
  <path d="M51 5V13"/>
</g>`;
const concepts = [
  {id:'01', key:'edition-t', name:'Edition T', tone:'Continuity', idea:'A sequence of editions, collected into one initial.', short:['A repeated band, an offset, one initial.','The closest evolution of the current mark.'], risk:'The stepped bars can still read as a technical or signal symbol.', mark:'<path fill="currentColor" d="M14 16H86V32H58V40H72V54H58V86H42V54H14V40H42V32H14Z"/>', micro:'<path fill="currentColor" d="M12 12H88V31H60V43H75V59H60V88H40V59H12V43H40V31H12Z"/>'},
  {id:'02', key:'ribbon-t', name:'Ribbon T', tone:'Expressive', idea:'A color band turns into a flowing, asymmetric T.', short:['A color band bends into a signature.','More movement; a softer collectible voice.'], risk:'The curved stem can suggest an umbrella or a J before a T.', mark:'<path fill="currentColor" d="M8 16H92V36H65C65 62 56 80 38 90L26 73C39 65 44 53 44 36H8Z"/>', micro:'<path fill="currentColor" d="M6 12H94V35H67C67 64 56 81 37 92L24 71C37 63 42 51 42 35H6Z"/>'},
  {id:'03', key:'contour-t', name:'Contour T', tone:'Recommended', idea:'A T inside a T: a permanent identity surrounded by its edition.', short:['An outer T holds a second T in the counter.','The artwork’s contour language, made compact.'], risk:'The internal channel needs optical adjustment below 24 px.', mark:'<path fill="currentColor" fill-rule="evenodd" d="M8 10H92V46H70V90H30V46H8ZM20 22H80V34H58V78H42V34H20Z"/>', micro:'<path fill="currentColor" fill-rule="evenodd" d="M6.25 6.25H93.75V50H68.75V93.75H31.25V50H6.25ZM18.75 18.75H81.25V37.5H56.25V81.25H43.75V37.5H18.75Z"/>'},
  {id:'04', key:'four-fields', name:'Four fields', tone:'Conceptual', idea:'Four independent fields leave a shared T-shaped space.', short:['Four fields around a shared negative-space T.','A nod to identity without using literal numbers.'], risk:'The symbol is more abstract; the upper split can make it read as a cross.', mark:'<path fill="currentColor" d="M10 10H46V30H10ZM54 10H90V30H54ZM10 42H38V90H10ZM62 42H90V90H62Z"/>', micro:'<path fill="currentColor" d="M6.25 6.25H43.75V31.25H6.25ZM56.25 6.25H93.75V31.25H56.25ZM6.25 43.75H37.5V93.75H6.25ZM62.5 43.75H93.75V93.75H62.5Z"/>'},
  {id:'05', key:'edition-seal', name:'Edition seal', tone:'Collectible', idea:'A compact portrait edition with an inset T, like a publisher’s seal.', short:['A portrait frame becomes a publisher’s seal.','An art-edition reading, with a compact footprint.'], risk:'The surrounding frame is generic; it may compete with the NFT frame.', mark:'<path fill="currentColor" fill-rule="evenodd" d="M14 6H86V94H14ZM23 15V85H77V15ZM29 25H71V37H56V73H44V37H29Z"/>', micro:'<path fill="currentColor" fill-rule="evenodd" d="M12.5 0H87.5V100H12.5ZM25 12.5V87.5H75V12.5ZM31.25 25H68.75V37.5H56.25V75H43.75V37.5H31.25Z"/>'},
  {id:'06', key:'drawn-signature', name:'Drawn signature', tone:'Typographic', idea:'A bespoke lowercase signature with repeated t geometry and a square i dot.', short:['A drawn lowercase wordmark with shared t forms.','Let the lettering carry the entire identity.'], risk:'The wordmark cannot serve as a favicon; its t is only a provisional companion.', mark:'<path fill="currentColor" d="M35 9H52V31H82V47H52V69Q52 77 60 77H78V93H58Q35 93 35 69V47H16V31H35Z"/>', micro:'<path fill="currentColor" d="M31.25 6.25H50V31.25H81.25V50H50V68.75Q50 75 56.25 75H81.25V93.75H56.25Q31.25 93.75 31.25 68.75V50H12.5V31.25H31.25Z"/>'},
];
function symbol(c,x,y,size,color=ink,micro=false){return `<g transform="translate(${x} ${y}) scale(${size/100})" color="${color}">${micro?c.micro:c.mark}</g>`;}
function text(t,x,y,size=24,color=ink,extra=''){return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${xml(t)}</text>`;}
function wordmark(c,x,y,size=56,color=ink,lower=false){
  if(c.key==='drawn-signature') return `<g transform="translate(${x} ${y-size*.8}) scale(${size/78})" color="${color}">${signature}</g>`;
  return text(lower?'tincta':'Tincta',x,y,size,color,'font-weight="600" letter-spacing="-2.8"');
}
function svg(content,w,h,title){return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title"><title id="title">${xml(title)}</title><style>text{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}.mono{font-family:"SFMono-Regular",Menlo,monospace}</style>${content}</svg>\n`;}
async function save(name,content,w,h,title){
  const source=svg(content,w,h,title); await writeFile(resolve(here,`${name}.svg`),source); await sharp(Buffer.from(source)).png().toFile(resolve(here,`${name}.png`));
}

await mkdir(resolve(here,'marks'),{recursive:true});
for(const c of concepts){
  const doc=svg(`<g color="${ink}">${c.mark}</g>`,100,100,`${c.name} — exploratory Tincta mark`);
  await writeFile(resolve(here,'marks',`${c.id}-${c.key}.svg`),doc);
  await writeFile(resolve(here,'marks',`${c.id}-${c.key}-micro.svg`),svg(`<g color="${ink}">${c.micro}</g>`,100,100,`${c.name} — provisional optical small-size study`));
}
await writeFile(resolve(here,'marks','06-drawn-signature-wordmark.svg'),svg(`<g transform="translate(8 8)" color="${ink}">${signature}</g>`,270,84,'Tincta — original vector lettering study'));

const W=1800,H=1500;
let board=`<rect width="${W}" height="${H}" fill="${paper}"/>`;
board+=text('Tincta',64,84,47,ink,'font-weight="600" letter-spacing="-2"');
board+=text('LOGO STUDY 01  /  SIX DIRECTIONS',1736,76,19,muted,'text-anchor="end" class="mono" letter-spacing="1"');
board+=text('Color, collected into a mark.',64,168,57,ink,'letter-spacing="-2"');
board+=text('Original vector sketches · Monochrome first · Open for refinement',64,214,24,muted);
board+='<path d="M64 253H1736" stroke="'+line+'"/>';
for(const [i,c] of concepts.entries()){
  const x=64+(i%3)*572,y=285+Math.floor(i/3)*561;
  if(i%3)board+=`<path d="M${x-28} ${y}V${y+518}" stroke="${line}"/>`;
  board+=text(`${c.id} / ${c.name}`,x,y+30,29,ink,'font-weight="500"');
  board+=text(c.tone.toUpperCase(),x,y+64,16,muted,'class="mono" letter-spacing="1"');
  if(c.id==='06'){
    board+=`<g transform="translate(${x+25} ${y+165}) scale(1.68)" color="${ink}">${signature}</g>`;
    board+=symbol(c,x+203,y+319,60);
    board+=text('companion t',x+230,y+408,17,muted,'text-anchor="middle"');
  } else {
    board+=symbol(c,x+166,y+100,174);
    board+=symbol(c,x+99,y+330,43);
    board+=wordmark(c,x+157,y+372,61);
  }
  board+=text(c.short[0],x,y+453,22,ink);
  board+=text(c.short[1],x,y+488,21,muted);
}
board+=`<path d="M64 1424H1736" stroke="${line}"/>`;
board+=text('EXPLORE 03 FOR THE MASTER MARK  /  02 FOR THE EXPRESSIVE ALTERNATIVE',64,1464,18,ink,'class="mono"');
board+=text('Design proposals, not approved assets',1736,1464,18,muted,'text-anchor="end"');
await save('01-directions',board,W,H,'Tincta logo study — six original directions');

// Three deliberate construction alternatives for each shortlisted silhouette.
const variants=[
  {id:'03A',name:'Single contour',note:'Recommended balance of mass and open space.',mark:concepts[2].mark},
  {id:'03B',name:'Soft inner corners',note:'A warmer junction; preserve the T inside the T.',mark:'<path fill="currentColor" fill-rule="evenodd" d="M8 10H92V46H76Q70 46 70 52V90H30V52Q30 46 24 46H8ZM20 22H80V34H64Q58 34 58 40V78H42V40Q42 34 36 34H20Z"/>'},
  {id:'03C',name:'Double contour',note:'Closer to the NFT linework; weaker at small sizes.',mark:'<path fill="none" stroke="currentColor" stroke-width="4" d="M8 10H92V46H70V90H30V46H8ZM17 19H83V37H61V81H39V37H17ZM26 28H74M50 28V72"/>'},
  {id:'02A',name:'Flowing ribbon',note:'The most fluid and asymmetric construction.',mark:concepts[1].mark},
  {id:'02B',name:'Quiet bend',note:'More upright; easier to recognize as a T.',mark:'<path fill="currentColor" d="M8 16H92V36H63V63Q63 84 44 90L35 72Q43 69 43 60V36H8Z"/>'},
  {id:'02C',name:'Split band',note:'A narrow cut introduces an edition-like repeat.',mark:'<path fill="currentColor" d="M8 16H92V25H8ZM8 31H92V40H65C64 63 56 80 38 90L26 73C39 65 44 53 44 40H8Z"/>'},
];
let variantsBoard=`<rect width="1800" height="1190" fill="${paper}"/>`+text('Two directions, six constructions.',64,95,57,ink,'letter-spacing="-2"')+text('03 / Contour T     +     02 / Ribbon T',64,147,24,muted);
variants.forEach((v,i)=>{
  const x=64+i%3*572,y=202+Math.floor(i/3)*453;
  variantsBoard+=`<path d="M${x} ${y}H${x+520}" stroke="${line}"/>`;
  variantsBoard+=text(`${v.id} / ${v.name}`,x,y+47,29);
  variantsBoard+=symbol(v,x+163,y+84,180);
  variantsBoard+=text(v.note,x,y+312,20,muted);
  variantsBoard+=text('32',x+167,y+389,16,muted,'class="mono"');
  variantsBoard+=symbol(v,x+214,y+364,32);
  variantsBoard+=text('64',x+293,y+389,16,muted,'class="mono"');
  variantsBoard+=symbol(v,x+336,y+344,64);
});
variantsBoard+=text('Construction sketches. Optical masters still require final spacing and pixel fitting.',64,1150,21,muted);
await save('02-construction-sketches',variantsBoard,1800,1190,'Tincta shortlisted logo construction sketches');

const selected=concepts[2], alt=concepts[1];
let app=`<rect width="1800" height="1390" fill="${paper}"/>`;
app+=text('03 / Contour T in use',64,91,57,ink,'letter-spacing="-2"');
app+=text('A constant silhouette. The seasons provide the color.',64,143,25,muted);
// A real monochrome master on generous empty space.
app+='<rect x="64" y="200" width="818" height="410" fill="#FFFFFF"/>';
app+=symbol(selected,145,304,155)+wordmark(selected,329,424,112);
app+=text('PRIMARY / TITLE CASE',96,245,16,muted,'class="mono"');
app+='<rect x="906" y="200" width="830" height="410" fill="'+ink+'"/>';
app+=symbol(selected,993,304,155,'#FFFFFF')+wordmark(selected,1177,424,112,'#FFFFFF',true);
app+=text('REVERSED / LOWERCASE EXPLORATION',938,245,16,'#CDCDC6','class="mono"');
// Season colors from the exact catalog. Each palette maintains source order.
for(const [j,seasonNo] of [1,9,14].entries()){
 const s=catalog.find(v=>v.season===seasonNo), x=64+j*572, y=652;
 app+=text(`SEASON ${String(seasonNo).padStart(2,'0')}`,x,y+20,17,muted,'class="mono"');
 s.collections.forEach((color,i)=>{app+=`<rect x="${x+i*52}" y="${y+44}" width="52" height="190" fill="${color}"/>`;});
 app+=`<rect x="${x+202}" y="${y+88}" width="116" height="102" fill="${paper}"/>`+symbol(selected,x+220,y+99,80);
 app+=text(s.theme,x,y+274,22,ink);
}
app+=`<path d="M64 976H1736" stroke="${line}"/>`;
app+=text('SMALL-SIZE STUDIES',64,1025,18,muted,'class="mono"');
let px=64;
for(const size of [16,24,32,48,64]){
 app+=symbol(selected,px,1091-size,size,ink,size<=24);
 app+=text(`${size} px`,px,1135,18,muted,'class="mono"');px+=127;
}
app+=text('16 / 24 use the provisional optical variant.',64,1191,21,muted);
app+=text('Check actual CSS-pixel size in the review gallery.',64,1226,21,muted);
app+=text('02 / EXPRESSIVE ALTERNATIVE',992,1025,18,muted,'class="mono"');
app+=symbol(alt,995,1061,126)+wordmark(alt,1157,1164,98);
app+=text('Ribbon T feels more fluid, but the initial is less immediate.',992,1226,20,muted);
app+=`<path d="M64 1293H1736" stroke="${line}"/>`;
app+=text('No single season color becomes the permanent master brand color.',64,1341,23,ink);
app+=text('DESIGN STUDY',1736,1341,17,muted,'text-anchor="end" class="mono"');
await save('03-applications',app,1800,1390,'Tincta Contour T logo applications, reverse, seasonal palettes and small-size studies');

const data=JSON.stringify(concepts).replace(/</g,'\\u003c');
const palettes=JSON.stringify(catalog).replace(/</g,'\\u003c');
const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tincta — logo study 01</title>
<style>
:root{color-scheme:light;--paper:${paper};--ink:${ink};--muted:${muted};--line:${line}}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif}main{max-width:1400px;margin:auto;padding:36px 42px 72px}header{display:flex;justify-content:space-between;align-items:center;gap:18px;padding-bottom:26px;border-bottom:1px solid var(--line)}.brand{font-size:30px;font-weight:600;letter-spacing:-1.5px}.eyebrow{font-family:monospace;font-size:12px;letter-spacing:.06em;color:var(--muted)}h1{font-size:clamp(34px,5.3vw,70px);font-weight:500;letter-spacing:-.045em;line-height:1.04;max-width:1000px;margin:49px 0 22px}h2{font-size:28px;font-weight:500;letter-spacing:-.025em}h3{font-size:21px;font-weight:500}p{line-height:1.55;max-width:830px}.intro{font-size:19px;color:var(--muted)}a{color:inherit;text-underline-offset:4px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 28px;margin-top:50px}.concept{border-top:1px solid var(--line);padding:24px 0 28px;min-width:0}.concept-top{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center}.concept h3{margin:0}.tone{font-size:12px;font-family:monospace;color:var(--muted)}.specimen{display:flex;height:210px;align-items:center;justify-content:center}.specimen svg{width:125px;height:125px}.specimen .signature{width:270px;max-width:100%;height:auto}.mini-lockup{display:flex;align-items:center;justify-content:center;gap:10px;min-height:42px}.mini-lockup svg{width:30px;height:30px}.word{font-size:36px;letter-spacing:-1.6px;font-weight:600}.concept p{font-size:15px;min-height:47px}.risk{color:var(--muted);font-size:13px!important;min-height:60px!important}.actions{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:13px}button,select{font:inherit;color:inherit}button{border:1px solid var(--ink);background:transparent;padding:10px 16px;cursor:pointer}button[aria-pressed=true]{background:var(--ink);color:var(--paper)}a:focus-visible,button:focus-visible,select:focus-visible{outline:3px solid #735CB1;outline-offset:4px}section{margin-top:54px}.review{border-top:1px solid var(--line);padding-top:12px}.controls{display:flex;flex-wrap:wrap;gap:18px;margin:24px 0}.controls label{display:flex;flex-direction:column;gap:8px;font-size:13px}.controls select{padding:10px;border:1px solid #A3A39D;background:white;min-width:160px;max-width:100%}.stage{position:relative;min-height:300px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:white;isolation:isolate}.stage .bands{position:absolute;inset:0;display:flex;z-index:-1}.bands span{flex:1}.stage-lockup{display:flex;align-items:center;gap:25px;padding:30px;max-width:100%}.stage-lockup svg{width:110px;height:110px;flex-shrink:0}.stage-lockup .word{font-size:clamp(40px,8vw,100px);letter-spacing:-.06em}.stage-lockup .signature{width:340px;max-width:100%;height:auto}.sizes{display:flex;align-items:end;gap:40px;flex-wrap:wrap;margin:30px 0}.size-item{display:flex;flex-direction:column;gap:16px}.size-item span{font:12px monospace;color:var(--muted)}.review-note{font-size:13px;color:var(--muted)}.recommend{display:grid;grid-template-columns:1fr 1fr;gap:36px;padding-top:24px;border-top:1px solid var(--line)}.recommend p{font-size:16px}.references{display:flex;flex-wrap:wrap;gap:20px}.references a{font-size:14px}footer{margin-top:48px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}img{display:block;width:100%;height:auto}.sheet{margin-top:24px}summary{cursor:pointer;padding:18px 0;border-top:1px solid var(--line);font-size:18px}details[open] summary{margin-bottom:10px}.caption{font-size:13px;color:var(--muted)}@media(max-width:880px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){main{padding:24px 20px 45px}.grid,.recommend{grid-template-columns:1fr}.grid{gap:15px}.specimen{height:190px}header{align-items:start}.eyebrow{max-width:130px;text-align:right;line-height:1.5}.controls{display:grid;grid-template-columns:1fr}.controls label,.controls select{width:100%;min-width:0}.stage{min-height:230px}.stage-lockup{gap:12px;padding:24px 16px}.stage-lockup svg{width:65px;height:65px}.stage-lockup .word{font-size:57px}.sizes{gap:27px}h1{margin-top:36px}.risk,.concept p{min-height:0!important}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><main>
<header><span class="brand">Tincta</span><span class="eyebrow">LOGO STUDY 01<br>23 SEPTEMBER 2026 UTC</span></header>
<h1>Color, collected<br>into a mark.</h1>
<p class="intro">Six original directions for a brand built around color, geometric art and permanent collectible identity. A stable mark across every season.</p>
<p>These are exploratory vector sketches. The existing white and ink identity, editorial typography and exact catalog palettes are the starting point. The mark should belong to Tincta across every collection, while the artwork retains its own seasonal character.</p>
<div class="grid">${concepts.map(c=>`<article class="concept"><div class="concept-top"><h3>${c.id} / ${c.name}</h3><span class="tone">${c.tone}</span></div><div class="specimen">${c.id==='06'?`<svg class="signature" viewBox="0 0 270 84" role="img" aria-label="Drawn Tincta wordmark"><g transform="translate(8 8)">${signature}</g></svg>`:`<svg viewBox="0 0 100 100" role="img" aria-label="${c.name}">${c.mark}</svg>`}</div><div class="mini-lockup"><svg viewBox="0 0 100 100" aria-hidden="true">${c.mark}</svg><span class="word">${c.id==='06'?'tincta':'Tincta'}</span></div><p>${c.idea}</p><p class="risk">To resolve: ${c.risk}</p><div class="actions"><button type="button" data-concept="${c.id}" aria-pressed="${c.id==='03'}">Inspect ${c.id}</button><a href="marks/${c.id}-${c.key}.svg" download>SVG sketch</a>${c.id==='06'?'<a href="marks/06-drawn-signature-wordmark.svg" download>Lettering SVG</a>':''}</div></article>`).join('')}</div>
<section class="review" aria-labelledby="review-title"><h2 id="review-title">Compare in use</h2>
<div class="controls"><label>Direction<select id="concept">${concepts.map(c=>`<option value="${c.id}" ${c.id==='03'?'selected':''}>${c.id} / ${c.name}</option>`).join('')}</select></label><label>Surface<select id="surface"><option value="white">Ink on white</option><option value="reverse">White on ink</option>${catalog.map(s=>`<option value="${s.season}">Season ${String(s.season).padStart(2,'0')} / ${xml(s.theme)}</option>`).join('')}</select></label><label>Wordmark case<select id="lettercase"><option value="title">Tincta</option><option value="lower">tincta</option></select></label></div>
<div class="stage" id="stage"><div class="bands" id="bands"></div><div class="stage-lockup" id="lockup"></div></div><p id="current" aria-live="polite" class="caption"></p>
<div class="sizes" id="sizes"></div><p class="review-note">Sizes above are actual CSS pixels. At 16 and 24 px, the mark uses a provisional optical variant with wider open spaces. These are review specimens, not final pixel-fitted masters.</p></section>
<section class="recommend"><div><h2>Develop 03 / Contour T</h2><p>The outer T and inner T use the same silhouette, connecting the brand to repeated geometric contours without adopting one season’s motif. It feels steady beside both expressive artwork and practical product information.</p><p>Refine the counter, stem width and wordmark spacing. Keep 03A’s flat geometry as the starting point; the double contour is a study for larger artwork only.</p></div><div><h2>Keep 02 / Ribbon T in play</h2><p>The curved stem gives the identity movement and warmth. It is the useful alternative if the brand should feel more like a color-led art label.</p><p>Its main decision is recognition: do viewers immediately read a T? 02B tests a more upright stem. Review this alongside 03 before selecting a direction.</p></div></section>
<section><h2>The study boards</h2><details open><summary>Six directions</summary><img src="01-directions.svg" alt="Six Tincta logo directions: Edition T, Ribbon T, Contour T, Four fields, Edition seal, and Drawn signature"></details><details><summary>Construction sketches</summary><img src="02-construction-sketches.svg" alt="Three Contour T constructions and three Ribbon T constructions"></details><details><summary>Color and applications</summary><img src="03-applications.svg" alt="Contour T in title case, lowercase, reversed and three catalog palettes, with size studies"></details></section>
<section><h2>Design principles</h2><p>Let the logo express the collectible identity. The prize draw stays in clear product copy. Four-part geometry refers only to permanent identity, and does not encode winners, odds or a score. Seasonal palettes remain in their original order.</p><p>One master silhouette should work in black, white, a favicon, an avatar and a quiet NFT signature. Color is contextual. No single season’s motif or palette becomes the entire brand.</p><div class="references"><a href="README.md">Written study and source notes</a><a href="01-directions.png" download>Directions PNG</a><a href="02-construction-sketches.png" download>Sketches PNG</a><a href="03-applications.png" download>Applications PNG</a></div></section>
<footer>Original, editable vector proposals. No application branding or minted artwork changed. Similarity and trademark clearance have not been assessed. Wordmarks 01–05 use local Helvetica/Arial for comparison; 06 is original path lettering.</footer>
</main><script>
const concepts=${data};const palettes=${palettes};const signature=${JSON.stringify(signature).replace(/</g,'\\u003c')};
const concept=document.getElementById('concept'),surface=document.getElementById('surface'),lettercase=document.getElementById('lettercase');
function render(){const c=concepts.find(x=>x.id===concept.value),rev=surface.value==='reverse',season=palettes.find(s=>String(s.season)===surface.value),color=rev?'#FFFFFF':'${ink}';const stage=document.getElementById('stage'),lockup=document.getElementById('lockup');stage.style.background=rev?'${ink}':'#FFFFFF';document.getElementById('bands').innerHTML=season?season.collections.map(color=>'<span style="background:'+color+'"></span>').join(''):'';lockup.style.color=color;lockup.style.background=season?'${paper}':'transparent';lettercase.disabled=c.id==='06';
lockup.innerHTML=c.id==='06'?'<svg class="signature" viewBox="0 0 270 84" role="img" aria-label="Original Tincta lettering"><g transform="translate(8 8)">'+signature+'</g></svg>':'<svg viewBox="0 0 100 100" role="img" aria-label="'+c.name+'">'+c.mark+'</svg><span class="word">'+(lettercase.value==='title'?'Tincta':'tincta')+'</span>';
document.getElementById('current').textContent=c.id+' / '+c.name+(season?' · '+season.theme+' · exact catalog colors, in order':rev?' · reversed':' · monochrome')+(c.id==='06'?' · original lowercase lettering':'');
document.getElementById('sizes').innerHTML=[16,24,32,48,64].map(s=>'<div class="size-item"><svg width="'+s+'" height="'+s+'" viewBox="0 0 100 100" role="img" aria-label="'+c.name+' at '+s+' pixels">'+(s<=24?c.micro:c.mark)+'</svg><span>'+s+' px</span></div>').join('');document.querySelectorAll('[data-concept]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.concept===c.id)));}
[concept,surface,lettercase].forEach(el=>el.addEventListener('change',render));document.querySelectorAll('[data-concept]').forEach(b=>b.addEventListener('click',()=>{concept.value=b.dataset.concept;render();document.getElementById('review-title').scrollIntoView({block:'start',behavior:'instant'});}));render();
</script></body></html>`;
await writeFile(resolve(here,'index.html'),html);
await writeFile(resolve(here,'study.json'),JSON.stringify({status:'exploratory-design-study',date:'2026-09-23',recommended:'03-contour-t',alternative:'02-ribbon-t',concepts:concepts.map(({mark,micro,...c})=>c),paletteSource:'seasons.json',assetsChanged:false},null,2)+'\n');
console.log('Created six mark studies, optical variants, three SVG/PNG boards and a self-contained review gallery.');
