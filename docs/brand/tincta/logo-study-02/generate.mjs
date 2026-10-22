import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const {concepts} = JSON.parse(await readFile(resolve(here,'concepts.json')));
const lettering = JSON.parse(await readFile(resolve(here,'lettering.json')));
const research = JSON.parse(await readFile(resolve(here,'research.json')));
const current = JSON.parse(await readFile(resolve(here,'previous-geometry.json')));
const ink='#111111', muted='#666666', line='#e4e4e4', paper='#ffffff';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(s,x,y,size=24,color=ink,extra='')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${escape(s)}</text>`;
const rule=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${line}"/>`;
const mark=(c,x,y,size,color=ink,micro=false)=>`<path transform="translate(${x} ${y}) scale(${size/100})" fill="${color}" d="${micro?c.micro:c.mark}"/>`;
const wm=(c,x,y,width,color=ink)=>`<g fill="${color}" transform="translate(${x} ${y}) scale(${width/lettering[c.id].width})">${lettering[c.id].paths.map(d=>`<path d="${d}"/>`).join('')}</g>`;
const logo=(c,x,y,width,color=ink)=>{
  const ratio=720/lettering[c.id].width;
  const symbolWidth=width*ratio/(.75+1.28*ratio);
  const wordWidth=width-symbolWidth*1.28;
  const wordHeight=wordWidth*780/lettering[c.id].width;
  return mark(c,x,y,symbolWidth,color)+wm(c,x+symbolWidth*1.28,y+symbolWidth*.5-wordHeight*.49,wordWidth,color);
};
const svg=(s,w,h,title)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(title)}"><style>text{font-family:"Helvetica Neue",Arial,sans-serif}</style>${s}</svg>\n`;
async function board(name,s,w,h,title){const source=svg(`<rect width="${w}" height="${h}" fill="${paper}"/>${s}`,w,h,title);await writeFile(resolve(here,name+'.svg'),source);await sharp(Buffer.from(source)).png().toFile(resolve(here,name+'.png'));}
function boardHead(title,sub,kicker,w=1800){return text('TINCTA / IDENTITY STUDY 02',72,64,17,muted,'letter-spacing="2"')+text(kicker,w-72,64,17,muted,'text-anchor="end"')+text(title,72,145,62,ink,'letter-spacing="-2"')+text(sub,72,194,25,muted)+rule(72,237,w-72,237);}

await mkdir(resolve(here,'assets'),{recursive:true});
for(const c of concepts){
  const l=lettering[c.id];
  for(const [suffix,color] of [['',ink],['-white','#ffffff']]){
    await writeFile(resolve(here,`assets/${c.id}-${c.name.toLowerCase()}-mark${suffix}.svg`),svg(mark(c,0,0,100,color),100,100,`${c.name} exploratory glyph`));
    await writeFile(resolve(here,`assets/${c.id}-wordmark${suffix}.svg`),svg(wm(c,0,0,l.width,color),l.width,l.height,`Tincta ${c.name} lettering study`));
    await writeFile(resolve(here,`assets/${c.id}-lockup${suffix}.svg`),svg(logo(c,0,0,400,color),400,98,`Tincta ${c.name} exploratory lockup`));
  }
  await writeFile(resolve(here,`assets/${c.id}-micro.svg`),svg(mark(c,0,0,100,ink,true),100,100,`${c.name} small-size optical study`));
  for(const size of [16,24,32,48,128]){
    await sharp(Buffer.from(svg(mark(c,0,0,100,ink,size<=32),100,100,c.name))).resize(size,size).png().toFile(resolve(here,`assets/${c.id}-${size}.png`));
  }
}

let s=boardHead('A more distinct Tincta.','Three routes from expressive project mark to enduring parent identity.','EXPLORATORY / 21 OCT 2026');
for(const [i,c] of concepts.entries()){
  const x=72+i*576;
  if(i)s+=rule(x-24,280,x-24,1155);
  s+=text(`${c.id.toUpperCase()} / ${c.name}`,x,310,32,ink,'font-weight="500"');
  s+=text(c.tone,x,351,22,muted);
  s+=mark(c,x+142,409,220);
  s+=wm(c,x+53,691,398);
  s+=`<rect x="${x}" y="867" width="504" height="125" fill="${ink}"/>`;
  s+=logo(c,x+90,892,320,'#fff');
  const sizes=[16,24,32,48];
  sizes.forEach((size,j)=>{const mx=x+50+j*113;s+=mark(c,mx,1060-size/2,size,ink,size<=32)+text(String(size),mx+size/2,1115,17,muted,'text-anchor="middle"');});
  s+=text(i===0?'Recommended starting point':i===1?'The corporate alternative':'The editorial alternative',x,1180,22,ink);
}
s+=text('Original glyph studies. Lettering sources and modifications are documented. No production identity has changed.',72,1245,19,muted);
await board('01-directions',s,1800,1290,'Three Tincta identity directions: Aperture, Fold and Ligature');

s=boardHead('The lettering carries the tone.','Compare case, rhythm and terminals independently of the symbol.','LETTERING / 02');
for(const [i,c] of concepts.entries()){
  const y=290+i*348;
  s+=text(`${c.id.toUpperCase()} / ${c.name}`,72,y+28,28,ink,'font-weight="500"');
  s+=wm(c,460,y-7,590);
  s+=text(['Lowercase / custom t + square i','Title case / compact grotesk','Uppercase / open tracking'][i],1160,y+28,22);
  s+=text(['Manrope base · weight 560','Instrument Sans · weight 560','Instrument Sans · weight 500'][i],1160,y+69,20,muted);
  s+=text(['Open counters, measured warmth.','More formal, with a strong initial.','The most editorial and expansive.'][i],1160,y+110,20,muted);
  s+=text('96 px',460,y+239,17,muted)+wm(c,546,y+212,96);
  s+=text('144 px',764,y+239,17,muted)+wm(c,863,y+204,144);
  s+=text('Rewards',1220,y+234,21,muted);
  s+=wm(c,1090,y+215,96);
  s+=`<rect x="1204" y="${y+211}" width="113" height="35" rx="3" fill="none" stroke="#ddd"/>`;
  if(i<2)s+=rule(72,y+295,1728,y+295);
}
s+=text('No font is installed or loaded by the study: the proposed wordmarks are self-contained vector outlines.',72,1370,20,muted);
await board('02-lettering',s,1800,1420,'Lettering comparison with case, weight, spacing and small wordmark specimens');

s=boardHead('One identity. Several roles.','Concept applications for a parent brand and its Rewards subproject.','APPLICATIONS / 03');
for(const [i,c] of concepts.entries()){
  const x=72+i*576;
  s+=text(`${c.id.toUpperCase()} / ${c.name}`,x,295,27);
  s+=`<rect x="${x}" y="337" width="504" height="86" fill="#fafafa" stroke="${line}"/>`;
  s+=wm(c,x+24,359,112)+text('Research',x+285,385,17,muted)+text('Projects',x+401,385,17,muted);
  s+=`<rect x="${x}" y="457" width="504" height="548" fill="${ink}"/>`;
  s+=text('TINCTA / RESEARCH',x+32,506,15,'#bdbdbd','letter-spacing="1.6"');
  s+=mark(c,x+148,546,208,'#fff');
  s+=text('Defined by code.',x+32,832,36,'#fff','letter-spacing="-1"');
  s+=text('Shaped by participation.',x+32,880,36,'#fff','letter-spacing="-1"');
  s+=wm(c,x+32,935,120,'#fff');
  s+=text('Concept research cover',x,1043,19,muted);
  s+=`<rect x="${x}" y="1100" width="96" height="96" rx="18" fill="${ink}"/>`+mark(c,x+12,1112,72,'#fff');
  s+=wm(c,x+138,1114,145);
  s+=`<rect x="${x+303}" y="1130" width="105" height="31" rx="3" fill="#fafafa" stroke="#ddd"/>`+text('Rewards',x+316,1152,18,'#555');
  s+=text('App tile + subproject lockup',x,1236,19,muted);
}
s+=text('Brand applications only. These are not screenshots of a deployed product or proposed changes to NFT artwork.',72,1320,19,muted);
await board('03-applications',s,1800,1370,'Three identities in navigation, research covers, app tiles and Rewards lockups');

s=boardHead('Change the silhouette.','The current initial and the three proposed compact marks, at a comparable scale.','BASELINE / 04');
const all=[{name:'Current / Drawn signature',mark:current.mark.path,micro:current.mark.smallPath},...concepts];
all.forEach((c,i)=>{
  const x=72+i*432;
  s+=text(i===0?'Current':c.id.toUpperCase()+' / '+c.name,x,307,27);
  s+=mark(c,x+56,386,220);
  s+=`<rect x="${x+80}" y="693" width="80" height="80" rx="15" fill="${ink}"/>`+mark(c,x+92,705,56,'#fff',true);
  s+=mark(c,x+215,717,32,ink,true)+mark(c,x+285,725,16,ink,true);
  s+=text(['Upright + crossbar + turning foot','Offset open field','Two planes + diagonal seam','Conjoined T / C'][i],x,852,19,muted);
});
s+=text('Tumblr resemblance is a first-reading concern, not a claim that the two source drawings are identical.',72,945,22,muted);
s+=text('A moves furthest from a typographic initial. B can read as 7. C remains a monogram and has the most letter ambiguity.',72,985,22,muted);
await board('04-silhouettes',s,1800,1040,'Current Tincta glyph compared with three proposed silhouettes');

// Keep the standalone review self-contained: SVG artwork and study data are inlined.
const template=await readFile(resolve(here,'study-template.html'),'utf8');
const card=c=>`<article class="direction" id="direction-${c.id}"><div class="direction-title"><h3>${c.id.toUpperCase()} / ${c.name}</h3><span>${c.id==='c'?'Selected':c.id==='a'?'Initial recommendation':'Alternative'}</span></div><p class="tone">${c.tone}</p><div class="identity-specimen"><svg viewBox="0 0 100 100" class="hero-mark" role="img" aria-label="${c.name} glyph"><path fill="currentColor" d="${c.mark}"/></svg><svg viewBox="${lettering[c.id].viewBox}" class="hero-wordmark" role="img" aria-label="${c.name} Tincta lettering">${lettering[c.id].paths.map(d=>`<path fill="currentColor" d="${d}"/>`).join('')}</svg></div><p class="position">${c.position}</p><p>${c.idea}</p><dl><dt>Lettering</dt><dd>${c.lettering}</dd><dt>Why consider it</dt><dd>${c.benefit}</dd><dt>Watch closely</dt><dd>${c.risk}</dd></dl><button type="button" class="inspect" data-direction="${c.id}">Inspect ${c.name}</button></article>`;
const refs=research.references.map((r,i)=>`<tr><td><a href="${escape(r.url)}" target="_blank" rel="noreferrer">${escape(r.name)} ↗</a><span>${escape(r.category)}</span></td><td>${escape(r.family)}</td><td>${escape(r.observation)}<small>${escape(r.evidence)}${r.additional?` <a href="${escape(r.additional)}" target="_blank" rel="noreferrer">Additional source ↗</a>`:''}</small></td><td>${escape(r.lesson)}</td></tr>`).join('');
const data=JSON.stringify({concepts,lettering,current}).replace(/</g,'\\u003c');
await writeFile(resolve(here,'index.html'),template.replace('<!-- DIRECTIONS -->',concepts.map(card).join('')).replace('<!-- RESEARCH_ROWS -->',refs).replace('/* STUDY_DATA */',`const study=${data};`));
console.log('Generated three vector identities, four review boards and the standalone research study.');
