import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
await mkdir(resolve(here,'verification'),{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const result={date:'2026-10-21',scope:'Minimal Foldscape study 04 only',browser:browser.version(),viewports:[]};
try{
 await page.goto('http://127.0.0.1:8128/');
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
 assert.equal(await page.locator('.direction').count(),3);
 for(const width of [320,390,768,960,961,999,1000,1001,1280,1440]){
  await page.setViewportSize({width,height:1000});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false);result.viewports.push({width,overflow});
 }
 await page.click('#circle');assert.equal(await page.locator('#circle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.art').first().evaluate(e=>getComputedStyle(e).borderRadius),'50%');
 await page.locator('#avatar-size').fill('128');assert.equal(await page.locator('.dynamic .avatar').first().evaluate(e=>e.getBoundingClientRect().width),128);
 await page.setViewportSize({width:320,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#square').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#square').getAttribute('aria-pressed'),'true');
 await page.locator('summary').focus();await page.keyboard.press('Enter');assert(await page.locator('details').evaluate(e=>e.open));
 result.axe=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,impact:v.impact}));assert.deepEqual(result.axe,[]);
 await page.keyboard.press('Enter');assert.equal(await page.locator('details').evaluate(e=>e.open),false);
 await page.locator('#avatar-size').fill('80');
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:resolve(here,'verification/study-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(here,'verification/study-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.addStyleTag({content:'.notes>p,.download,.dynamic{display:none}.art{height:390px;aspect-ratio:auto}.art img{height:86%;width:86%;object-fit:contain}.avatars{justify-content:center;min-height:132px;padding:16px 0}.grid{padding:24px;gap:32px}.circle-view .art{width:100%;aspect-ratio:1;height:auto}'});
 await page.locator('#directions').screenshot({path:resolve(here,'comparison.png')});
 await page.click('#circle');await page.locator('#directions').screenshot({path:resolve(here,'comparison-circles.png')});
 result.interactions=['Square/circle framing','32–128px avatar slider','Keyboard activation','Reference disclosure'];
 assert.deepEqual(errors,[]);result.errors=errors;result.status='pass';
 await writeFile(resolve(here,'verification/browser-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
