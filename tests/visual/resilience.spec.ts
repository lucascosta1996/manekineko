import { test, expect } from '@playwright/test';
import { prepare, ready, urls, metrics } from './fixtures';
const boundaries=[599,600,601,759,760,761,959,960,961];
for(const [app,path] of [['landing','/'],['web','/seasons'],['launch','/dashboard']] as const) {
 test(`${app} breakpoint boundaries and text spacing`,async({page})=>{
  await prepare(page);await page.goto(urls[app]+path);await ready(page);
  for(const width of boundaries) {
   await page.setViewportSize({width,height:800});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`).toBe(true);
   const buttons=page.locator('.ui-button:visible');
   for(let index=0;index<await buttons.count();index++) {
    const result=await buttons.nth(index).evaluate(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,font:s.fontSize,padding:s.paddingBlockStart,radius:s.borderRadius};});
    expect(result.height).toBeGreaterThanOrEqual(40);expect(result.font).toBe('14px');expect(result.radius).toBe('3px');
   }
  }
  await page.setViewportSize({width:844,height:390});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'landscape reflow').toBe(true);
  await page.setViewportSize({width:320,height:800});
  await page.addStyleTag({content:'html{font-size:200%}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), '200 percent text reflow: ' + JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.art-gallery')).slice(0,16).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right}))))).toBe(true);
  await page.addStyleTag({content:':where(p,span,a,button,input,textarea,label){line-height:1.5;letter-spacing:.12em;word-spacing:.16em}p{margin-block-end:2em}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'text spacing reflow').toBe(true);
 });
 test(`${app} coarse-pointer controls in real consumer`,async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'block',hasTouch:true,viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const page=await context.newPage();await prepare(page);await page.goto(urls[app]+path);await ready(page);
  for(const button of await page.locator('.ui-button:visible').all()) {
   const data=await button.evaluate(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,padding:s.paddingBlockStart,icon:el.classList.contains('ui-icon-button')};});
   expect(data.height).toBeGreaterThanOrEqual(44);expect(data.padding).toBe(data.icon?'12px':'11px');
  }
  await context.close();
 });
}
