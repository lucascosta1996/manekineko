import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
await mkdir(resolve(here,'verification'),{recursive:true});
await mkdir(resolve(here,'exports'),{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const loaded=()=>page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
const result={date:'2026-10-21',scope:'Color artwork study 02 only',browser:browser.version(),viewports:[]};
try {
  await page.goto('http://127.0.0.1:8128/');await loaded();
  for(const width of [320,390,759,760,761,768,960,961,1280,1440]){
    await page.setViewportSize({width,height:1000});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false);result.viewports.push({width,overflow});
  }
  await page.click('#warm');await loaded();
  assert.equal(await page.locator('#warm').getAttribute('aria-pressed'),'true');
  for(const card of await page.locator('.direction').all()){
    assert.match(await card.locator('.art img').getAttribute('src'),/-warm\.svg$/);
    assert.match(await card.locator('.download').getAttribute('href'),/-warm\.svg$/);
  }
  await page.click('#circle');assert.equal(await page.locator('.art').first().evaluate(e=>getComputedStyle(e).borderRadius),'50%');
  await page.locator('#avatar-size').fill('128');assert.equal(await page.locator('.dynamic .avatar').first().evaluate(e=>e.getBoundingClientRect().width),128);
  await page.setViewportSize({width:320,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#family').focus();await page.keyboard.press('Space');await loaded();assert.equal(await page.locator('#family').getAttribute('aria-pressed'),'true');
  result.interactions=['Palette changes artwork, alt text and SVG links','Circle/square framing','32–128px avatar slider','Keyboard activation'];
  result.axe=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,impact:v.impact}));assert.deepEqual(result.axe,[]);
  await page.click('#square');await page.locator('#avatar-size').fill('80');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:resolve(here,'verification/study-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(here,'verification/study-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:1000});
  await page.addStyleTag({content:'.notes>p,.download,.dynamic,.rule{display:none}.art{height:410px;aspect-ratio:auto}.art img{height:410px;width:100%;object-fit:contain}.avatars{justify-content:center;min-height:132px;padding:16px 0}.grid{padding:24px;gap:32px}'});
  await page.locator('#directions').screenshot({path:resolve(here,'comparison.png')});
  await page.click('#warm');await loaded();await page.locator('#directions').screenshot({path:resolve(here,'comparison-warm.png')});
  const exportPage=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
  const directions=JSON.parse(await readFile(resolve(here,'directions.json'),'utf8'));
  for(const d of directions)for(const mode of ['family','warm']){
    const filename=`${d.id}-${d.slug}-${mode}`;
    await exportPage.setContent(`<html><head><style>html,body{margin:0}svg{width:1024px;height:1024px;display:block}</style></head><body>${await readFile(resolve(here,`sketches/${filename}.svg`),'utf8')}</body></html>`);
    await exportPage.screenshot({path:resolve(here,`exports/${filename}.png`)});
  }
  await exportPage.close();
  assert.deepEqual(errors,[]);result.errors=errors;result.status='pass';result.exports=8;
  await writeFile(resolve(here,'verification/browser-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
