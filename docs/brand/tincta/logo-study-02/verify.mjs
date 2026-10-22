import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here=dirname(fileURLToPath(import.meta.url));
const dir=resolve(here,'verification');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({deviceScaleFactor:1,locale:'en-US',timezoneId:'Asia/Shanghai'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const report={date:'2026-10-21',scope:'Standalone design study only',browser:browser.version(),platform:process.platform,viewports:[],interactions:[],errors};
try{
  for(const width of [320,390,768,1280,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:8126',{waitUntil:'load'});
    await page.locator('#stage-label').waitFor();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    const brokenImages=await page.locator('img').evaluateAll(els=>els.filter(e=>!e.complete||e.naturalWidth===0).map(e=>e.src));
    report.viewports.push({width,overflow,brokenImages});
    assert.equal(overflow,false,`Overflow at ${width}`);assert.equal(brokenImages.length,0);
    if([390,1440].includes(width)){
      await page.screenshot({path:resolve(dir,`study-${width}.png`),fullPage:true});
      await page.locator('#directions').screenshot({path:resolve(dir,`directions-${width}.png`)});
    }
  }
  for(const value of ['a','b','c']){
    await page.selectOption('#direction-select',value);
    await page.click('#dark');await page.click('#rewards-toggle');
    const label=await page.locator('#stage-label').innerText();
    assert(label.startsWith(value.toUpperCase()));
    assert.equal(await page.locator('#dark').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.stage-rewards').count(),1);
    assert.equal(await page.locator('#brand-stage').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 17, 17)');
    report.interactions.push({direction:value,label,dark:true,rewards:true});
    await page.click('#rewards-toggle');await page.click('#light');
  }
  await page.locator('#size').fill('16');
  const actualSize=await page.locator('#adjustable svg').boundingBox();
  assert.equal(actualSize.width,16);assert.equal(actualSize.height,16);report.adjustedGlyphPixels=16;
  await page.getByRole('button',{name:'Inspect Aperture'}).click();
  assert.equal(await page.locator('#direction-select').inputValue(),'a');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'direction-select');
  report.inspectButton='Selection, scrolling and focus passed';
  await page.locator('#direction-select').focus();
  await page.keyboard.press('b');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#direction-select').inputValue(),'b');
  report.keyboard='Native select typeahead and Tab passed';
  report.axeLight=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));
  await page.setViewportSize({width:390,height:844});await page.click('#dark');await page.click('#rewards-toggle');
  await page.locator('#inspector').screenshot({path:resolve(dir,'inspector-390-dark.png')});
  report.axeDark=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));
  await page.getByText('Open the 30-reference research matrix and source notes',{exact:true}).click();
  report.openMatrixRows=await page.locator('tbody tr').count();assert.equal(report.openMatrixRows,30);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:320,height:900});
  await page.addStyleTag({content:'p,dd{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}'});
  report.textSpacingOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(report.textSpacingOverflow,false);
  assert.equal(errors.length,0);assert.equal(report.axeLight.length,0);assert.equal(report.axeDark.length,0);
  report.result='pass';
}catch(error){report.result='fail';report.failure=error.message;throw error;}
finally{await writeFile(resolve(dir,'browser-check.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));}
