import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),output=resolve(here,'verification');await mkdir(output,{recursive:true});
const b=await chromium.launch(),c=await b.newContext({deviceScaleFactor:1}),p=await c.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));const result={date:'2026-10-21',scope:'Standalone artwork study only',viewports:[],browser:b.version()};
try{
 await p.goto('http://127.0.0.1:8128/');await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
 for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:1000});const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);result.viewports.push({width,overflow});}
 await p.click('#circle');assert.equal(await p.locator('#circle').getAttribute('aria-pressed'),'true');await p.click('#negative');assert(await p.locator('body').evaluate(e=>e.classList.contains('reverse')));
 await p.locator('#avatar-size').fill('128');assert.equal(await p.locator('.dynamic .avatar').first().evaluate(e=>e.getBoundingClientRect().width),128);
 await p.setViewportSize({width:320,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.locator('#positive').focus();await p.keyboard.press('Space');assert.equal(await p.locator('#positive').getAttribute('aria-pressed'),'true');
 result.interactions=['Circle/square framing','Positive/reversed ink','32–128px avatar slider','Keyboard button activation'];
 result.axe=(await new AxeBuilder({page:p}).analyze()).violations.map(v=>({id:v.id,impact:v.impact}));assert.deepEqual(result.axe,[]);
 await p.click('#square');await p.locator('#avatar-size').fill('80');await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:resolve(output,'study-desktop.png'),fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:resolve(output,'study-mobile.png'),fullPage:true});
 await p.setViewportSize({width:1280,height:1000});await p.addStyleTag({content:'.notes>p,.download,.avatar-item.dynamic{display:none}.grid{gap:36px 32px;padding:0 28px 28px}.avatars{min-height:120px;padding-bottom:0;justify-content:center;gap:28px}.art{height:430px;aspect-ratio:auto}.art img{height:430px;width:100%;object-fit:contain}.circle-view .art{width:430px;height:430px;margin:20px auto;aspect-ratio:1}.circle-view .art img{width:84%;height:84%}.notes{padding-top:12px}.card-head{padding-top:14px}'});await p.locator('#directions').screenshot({path:resolve(here,'comparison.png')});
 await p.click('#circle');await p.click('#negative');await p.locator('#directions').screenshot({path:resolve(here,'comparison-reversed.png')});
 assert.deepEqual(errors,[]);result.errors=errors;result.status='pass';await writeFile(resolve(output,'browser-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await b.close();}
