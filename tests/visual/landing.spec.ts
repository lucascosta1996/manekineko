import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, collection, metrics } from './fixtures';

test.use({ trace: 'on', video: 'on' });
test.describe('Landing asynchronous production states', () => {
 for (const width of [390,1440]) {
  test(`hero first paint through delayed response ${width}`, async ({ page }, info) => {
   await page.setViewportSize({width,height:width===390?844:900}); await page.emulateMedia({reducedMotion:'reduce'}); await prepare(page);
   await page.addInitScript(() => {
    (window as any).__heroFlashes = [];
    new MutationObserver(() => { const region = document.querySelector('.hero-live[data-phase="pending"]'); if(region?.querySelector('button')) (window as any).__heroFlashes.push(region.textContent); }).observe(document,{subtree:true,childList:true,attributes:true});
   });
   let release!: () => void; const held = new Promise<void>(resolve=>release=resolve); let requests=0;
   await page.route('**/api/live-collection', async route=>{requests++;await held;await route.fulfill({json:{collection}});});
   await page.goto(urls.landing);
   await expect.poll(()=>requests).toBe(1);
   await expect(page.getByRole('button',{name:'Reduced motion',exact:true})).toBeDisabled();
   const cta=page.getByRole('link',{name:'Explore the rewards',exact:true}); const before=await cta.boundingBox();
   for(const [advance,label] of [[500,'early'],[2500,'slow'],[7000,'held-10s']] as const) {
    await new Promise(resolve => setTimeout(resolve, advance));
    await page.clock.runFor(advance);
    await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','pending');
    await expect(page.locator('.hero-live').getByRole('button')).toHaveCount(0);
    await expect(page.locator('.hero-live')).not.toContainText(/Refresh|Retry|unavailable/);
    await page.screenshot({path:info.outputPath(`hero-${label}.png`)});
   }
   expect(await page.evaluate(() => (window as any).__heroFlashes)).toEqual([]);
   release(); await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
   await expect(page.locator('.hero-live')).toContainText('750 tickets remaining');
   const after=await cta.boundingBox(); expect(after?.x).toBe(before?.x);expect(after?.y).toBe(before?.y);
   const m=await metrics(page,'.hero-actions .ui-button'); expect(m.padding).toEqual(['9px','14px','9px','14px']); expect(m.size).toBe('14px');expect(m.height).toBe(40);
   await expect(page).toHaveScreenshot(`hero-loaded-${width}.png`);
  });
  test(`empty and failed retry retain truthful state ${width}`, async ({ page }) => {
   await page.setViewportSize({width,height:844});await prepare(page,'empty'); await page.goto(urls.landing);
   await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','empty');
   await expect(page.locator('.hero-live').getByRole('button')).toHaveCount(0);
   let response: 'failure'|'hold'|'success' = 'failure'; let requests=0;let release!:()=>void;
   const held=new Promise<void>(resolve=>release=resolve);
   await page.route('**/api/live-collection',async route=>{requests++;if(response==='hold')await held;await route.fulfill({status:response==='failure'?503:200,json:response==='failure'?{error:'unavailable'}:{collection}});});
   await page.clock.runFor(20000);await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','error');
   const retry=page.getByRole('button',{name:'Refresh',exact:true});await retry.focus();const box=await retry.boundingBox();
   response='hold';await retry.click();await expect(retry).toHaveAttribute('aria-busy','true');
   await retry.evaluate((button: HTMLButtonElement)=>{button.click();button.click();});expect(requests).toBe(2);
   expect(await retry.boundingBox()).toEqual(box);response='success';release();
   await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
   await expect(page.locator('.hero-live').getByRole('link',{name:'Visual study'})).toBeFocused();
   response='failure';await page.clock.runFor(20000);
   await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','stale');
   await expect(page.locator('.hero-live')).toContainText('Visual study');
   await expect(page.locator('.hero-live')).toContainText('last known state');
   await expect(page.locator('.hero-live')).not.toContainText('tickets remaining');
   await expect(page.locator('.hero-live [data-live="true"]')).toHaveCount(0);
   await expect(page).toHaveScreenshot(`hero-stale-${width}.png`);
   await page.clock.resume();const result=await new AxeBuilder({page}).analyze();expect(result.violations).toEqual([]);
  });
 }
 test('malformed, timeout, offline and reconnection', async ({page})=>{
  await prepare(page);await page.route('**/api/live-collection',route=>route.fulfill({json:{surprise:true}}));await page.goto(urls.landing);
  await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','error');
  await page.route('**/api/live-collection',()=>new Promise(()=>{}));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.clock.runFor(12001);
  await expect(page.getByRole('button',{name:'Refresh',exact:true})).not.toHaveAttribute('aria-busy','true', {timeout:15000});
  await page.context().setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','error');
  await page.unroute('**/api/live-collection');await page.context().setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
 });
 test('newsletter inline validation, duplicate guard, stable geometry and retained draft',async({page})=>{
  await prepare(page);await page.goto(urls.landing);await ready(page);
  const form=page.getByRole('form',{name:'Launch notifications'}), email=page.getByRole('textbox',{name:'Email address'}), button=form.getByRole('button');
  let count=0; let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/newsletter',async route=>{count++;await held;await route.fulfill({status:503,json:{error:'Unavailable'}});});
  await button.click();await expect(email).toBeFocused();await expect(email).toHaveAttribute('aria-invalid','true');expect(count).toBe(0);
  await email.fill('collector@example.invalid'); const before=await button.boundingBox();
  await button.click();await expect(button).toHaveAttribute('aria-busy','true');
  await form.evaluate(form=>{(form as HTMLFormElement).requestSubmit();(form as HTMLFormElement).requestSubmit();});
  expect(count).toBe(1);expect(await button.boundingBox()).toEqual(before);release();
  await expect(form).toContainText('We couldn’t save your email right now. Please try again.');
  await expect(email).toHaveValue('collector@example.invalid');expect(await button.boundingBox()).toEqual(before);
  await page.route('**/api/newsletter',route=>route.fulfill({json:{success:true}}));await button.click();
  await expect(form).toContainText('You’re on the list.');expect(await button.boundingBox()).toEqual(before);
  await expect(page.locator('footer')).toHaveCount(1);await expect(page.locator('footer')).toContainText('©');
 });
 test('mobile navigation, FAQ, missing image and support dialog',async({page})=>{
  await prepare(page);await page.setViewportSize({width:390,height:568});
  await page.route('**/artwork/*.svg',r=>r.abort());await page.goto(urls.landing);await ready(page);
  await page.getByRole('button',{name:'Open navigation'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open navigation'})).toBeFocused();
  await page.getByText('How can I verify the contract?',{exact:true}).click();await expect(page.locator('details[open]')).toHaveCount(1);
  await expect(page.locator('.artwork-fallback')).toHaveCount(6);
  await page.getByRole('button',{name:'Support',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.resume();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await page.clock.runFor(50);await expect(page.getByRole('button',{name:'Support',exact:true})).toBeFocused();
 });
});

test('Landing hidden/visible recovery keeps one background request', async ({page}) => {
 await prepare(page); let requests=0, held=false; let release!:()=>void;
 const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/live-collection',async route=>{requests++;if(held)await pending;await route.fulfill({json:{collection}});});
 await page.goto(urls.landing);await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(60000);expect(requests).toBe(1);
 held=true;
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>requests).toBe(2);
 await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
 await expect(page.locator('.hero-live').getByRole('button')).toHaveCount(0);
 await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'));});
 expect(requests).toBe(2);release();await expect(page.locator('.hero-live')).toContainText('750 tickets remaining');
});

test('Landing late response cannot restore fresh availability while offline', async ({page}) => {
 await prepare(page);await page.goto(urls.landing);await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);let requests=0;
 await page.route('**/api/live-collection',async route=>{requests++;await pending;await route.fulfill({json:{collection}});});
 await page.clock.runFor(20000);await expect.poll(()=>requests).toBe(1);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
 release();await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','stale');
 await expect(page.locator('.hero-live')).not.toContainText('tickets remaining');
 await expect(page.locator('.hero-live [data-live="true"]')).toHaveCount(0);
 await page.unroute('**/api/live-collection');
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});
 await expect(page.locator('.hero-live')).toHaveAttribute('data-phase','ready');
});

test('Landing motion preference and explicit pause control both artwork and palette cycling', async ({page}) => {
 await page.emulateMedia({reducedMotion:'no-preference'});await prepare(page);await page.goto(urls.landing);await ready(page);
 const animation=page.locator('.sculpture-orbit');
 await expect(animation).toHaveCSS('animation-play-state','running');
 const pause=page.getByRole('button',{name:'Pause animations',exact:true});await pause.click();
 await expect(animation).toHaveCSS('animation-play-state','paused');
 const color=await page.locator('.sculpture-orbit ellipse').first().getAttribute('stroke');
 await page.clock.runFor(7000);expect(await page.locator('.sculpture-orbit ellipse').first().getAttribute('stroke')).toBe(color);
 await page.getByRole('button',{name:'Play animations',exact:true}).click();
 await expect(animation).toHaveCSS('animation-play-state','running');
 await page.clock.runFor(6500);expect(await page.locator('.sculpture-orbit ellipse').first().getAttribute('stroke')).not.toBe(color);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.getByRole('button',{name:'Play animations',exact:true})).toBeDisabled();
 await expect(animation).toHaveCSS('animation-name','none');
 await expect(page.getByRole('button',{name:'Reduced motion',exact:true})).toBeDisabled();
});

test('Landing recovery focuses the empty status without stealing moved focus', async ({page}) => {
 await prepare(page,'error');await page.goto(urls.landing);
 const region=page.getByRole('region',{name:'Collection status',exact:true});
 await expect(region).toHaveAttribute('data-phase','error');
 await page.route('**/api/live-collection',route=>route.fulfill({json:{collection:null}}));
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(region).toHaveAttribute('data-phase','empty');await expect(region).toBeFocused();
 await page.unroute('**/api/live-collection');await page.clock.runFor(20000);
 await expect(region).toHaveAttribute('data-phase','error');
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/live-collection',async route=>{await pending;await route.fulfill({json:{collection}});});
 const retry=page.getByRole('button',{name:'Refresh',exact:true});await retry.click();await expect(retry).toHaveAttribute('aria-busy','true');
 const cta=page.getByRole('link',{name:'Explore the rewards',exact:true});await cta.focus();release();
 await expect(region).toHaveAttribute('data-phase','ready');await expect(cta).toBeFocused();
});
