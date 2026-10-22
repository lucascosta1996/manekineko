import {writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const directions=[
  {
    "id": "a",
    "name": "Essential",
    "slug": "essential",
    "tag": "Faithful",
    "alt": "Two unequal folded wings and a broad lower fold reveal a small orange and red center.",
    "cue": "Original gesture, fewer folds",
    "description": "Keeps the tall right wing and lower supporting fold. Secondary shards are removed and the center becomes a simple two-face polygon.",
    "connection": "The enclosing planes pull away to reveal a distinct center: the same opening and discovery idea as Unfold.",
    "assessment": "Closest to the selected artwork. The separated folds keep a sculptural quality, with more space between the major pieces."
  },
  {
    "id": "b",
    "name": "Cradle",
    "slug": "cradle",
    "tag": "Compact",
    "alt": "A compact broad folded cradle opens around a small orange and red polygon.",
    "cue": "A compact reveal",
    "description": "A broader, continuous lower form gathers the folds into one silhouette. The center sits higher in the opening and remains visibly separate.",
    "connection": "The supporting outer structure frames the revealed center. The intended association remains discovering something valuable.",
    "assessment": "My preferred PFP direction: the broad base and larger center give it more presence at small sizes. The structure feels cohesive."
  },
  {
    "id": "c",
    "name": "Open",
    "slug": "open",
    "tag": "Airy",
    "alt": "Two diagonal folded wings open widely around a small center above a low angular base.",
    "cue": "More space, more motion",
    "description": "The wings stretch outward around a wider white opening. A continuous lower bend connects the sweeping diagonal forms.",
    "connection": "The outward gesture emphasizes the moment of opening, with the center as the thing being discovered.",
    "assessment": "The most expansive silhouette. Strong directional movement, with a smaller center relative to the surrounding wings."
  }
];
const cards=directions.map(d=>`<article class="direction" id="${d.id}"><div class="card-head"><h2><span class="letter">${d.id.toUpperCase()}</span><span class="concept-name">${d.name}</span><span class="blind-name">Study ${d.id.toUpperCase()}</span></h2><span class="tag meaning">${d.tag}</span></div><figure class="art"><img src="sketches/${d.id}-${d.slug}.png" width="1254" height="1254" alt="${d.alt}"><figcaption class="asset-error" hidden>Sketch unavailable. Reload the study to try again.</figcaption></figure><div class="notes"><div class="meaning"><h3>${d.cue}</h3><p>${d.description}</p><h3>Connection to Rewards</h3><p>${d.connection}</p></div><div class="avatars">${[32,48,96].map(size=>`<div class="avatar-item"><div class="avatar" style="--size:${size}px"><img src="sketches/${d.id}-${d.slug}.png" alt="" width="1254" height="1254"></div><span>${size} px</span></div>`).join('')}<div class="avatar-item dynamic"><div class="avatar" style="--size:var(--adjusted-size)"><img src="sketches/${d.id}-${d.slug}.png" alt="" width="1254" height="1254"></div><span class="size-display">80 px</span></div></div><p class="assessment meaning">${d.assessment}</p><a class="download" href="sketches/${d.id}-${d.slug}.png">Open full sketch ↗</a></div></article>`).join('\n');
const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tincta — Unfold variations</title><link rel="stylesheet" href="style.css"></head>
<body><div class="wrap"><header class="masthead"><span>TINCTA / ARTWORK STUDY 06</span><span class="muted">22 October 2026 · Unfold, simplified</span></header><main>
<section class="intro"><div><p class="eyebrow">Opening / discovery / reward</p><h1>Unfold.<br>Three simpler expressions.</h1></div><p class="meaning">The same opening gesture, reduced to broader folds and a simpler revealed center. Compare the silhouette, the white space and the small circular previews. All three retain the warm palette and folded character of Unfold.</p><p class="blind-instruction">Look at each artwork before reading its explanation. Note the first things it brings to mind. These impressions matter more than agreeing with a written rationale.</p></section>
<div class="controls" aria-label="Sketch preview controls"><div class="control-group" role="group" aria-label="Artwork frame"><span>Frame</span><button type="button" id="square" aria-pressed="true">Square</button><button type="button" id="circle" aria-pressed="false">Circle</button></div><button type="button" id="first-look" aria-pressed="false">Hide explanations</button><label class="size-label" for="avatar-size">Avatar <input id="avatar-size" type="range" min="32" max="128" step="8" value="80"><output id="avatar-size-value" for="avatar-size">80 px</output></label></div>
<noscript><p>All sketches and fixed avatar previews are visible. Preview controls require JavaScript.</p></noscript>
<section class="grid" id="directions" aria-label="Three minimal Unfold variations">${cards}</section>
<section class="closing meaning"><div><p class="eyebrow">Recommendation</p><h2>B / Cradle is the strongest PFP candidate.</h2><p>Its broad connected base and clearly separated center stay composed at avatar size. A is the closest reduction of the original; C gives the gesture more space and movement.</p></div><div><p class="eyebrow">Keep the meaning visible</p><p>The intended reading is an opening form revealing something valuable. These are visual hypotheses, not tested audience associations. The hide-explanations control lets you compare the shapes before reading the rationale.</p><a class="download" href="comparison-unlabeled.png">Open comparison without names ↗</a></div></section>
<details class="reference-details meaning"><summary>Compare with the selected Unfold</summary><div class="references"><article class="reference"><img src="references/unfold.png" width="1254" height="1254" alt="Selected Unfold artwork before simplification."><div><h2>Selected Unfold</h2><p>The opening enclosure and separate center are retained. The new variations remove secondary folds and reduce the center to two broad faces.</p></div></article></div></details>
</main><footer class="foot"><span>Concept exploration · No production artwork replaced.</span><span><a href="README.md">Concept brief</a> · <a href="prompts.json">Generation prompts</a></span></footer></div>
<script>
const root=document.body;
function setFrame(circle){root.classList.toggle('circle-view',circle);document.getElementById('circle').setAttribute('aria-pressed',String(circle));document.getElementById('square').setAttribute('aria-pressed',String(!circle));}
document.getElementById('square').onclick=()=>setFrame(false);document.getElementById('circle').onclick=()=>setFrame(true);
document.getElementById('first-look').onclick=event=>{const hidden=root.classList.toggle('first-look');event.currentTarget.setAttribute('aria-pressed',String(hidden));event.currentTarget.textContent=hidden?'Show explanations':'Hide explanations';};
document.getElementById('avatar-size').oninput=event=>{const value=event.target.value;root.style.setProperty('--adjusted-size',value+'px');document.getElementById('avatar-size-value').textContent=value+' px';for(const label of document.querySelectorAll('.size-display'))label.textContent=value+' px';};
for(const image of document.querySelectorAll('.art img')){image.onerror=()=>{image.hidden=true;image.parentElement.querySelector('.asset-error').hidden=false;};image.onload=()=>{image.hidden=false;image.parentElement.querySelector('.asset-error').hidden=true;};}
</script></body></html>\n`;
await writeFile(resolve(here,'index.html'),html);
await writeFile(resolve(here,'directions.json'),JSON.stringify(directions,null,2)+'\n');
console.log('Built the minimal Unfold study.');
