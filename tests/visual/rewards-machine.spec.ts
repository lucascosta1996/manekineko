import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import artwork from '../../apps/landing-page/components/rewards-machine-artwork.json';

for (const width of [320,390,768,1280,1440]) test(`Rewards machine static steps and claim settlement ${width}`, async ({page}, info) => {
  test.skip(info.project.name !== 'chromium' && ![390,1440].includes(width), 'Secondary engines cover phone and desktop.');
  await page.setViewportSize({width,height:900}); await prepare(page); await page.goto(`${urls.landing}/rewards`); await ready(page);
  const machine = page.locator('[data-rewards-machine]');
  await expect(machine).toHaveAttribute('data-motion','paused');
  await expect(machine).toHaveAttribute('data-phase','winners');
  await expect(page.locator('.header [data-tincta-logo="mark"]')).toHaveCount(1);
  await expect(page.locator('.ui-rewards-glyph-brand')).toHaveText('REWARDS');
  await expect(page.locator('[data-tincta-artwork="open"]')).toHaveCount(0);
  await expect(machine.getByRole('button',{name:/animation/})).toHaveCount(0);
  await page.locator('.hero').screenshot({path:info.outputPath(`machine-winners-${width}.png`)});
  const immutable = await machine.locator('[data-machine-winner] img').evaluateAll(images=>images.map(img=>img.getAttribute('src')));
  for (const phase of ['Mint','Pool','VRF','Winners','Claims']) {
    await machine.getByRole('button',{name:phase,exact:true}).click();
    await expect(machine).toHaveAttribute('data-phase',phase.toLowerCase());
  }
  await expect(machine).toHaveAttribute('data-prize-fill','0.000');
  await expect(machine.locator('[data-machine-winner][data-claimed="true"]')).toHaveCount(6);
  for(const nft of artwork) {
    const card=machine.locator(`[data-machine-winner="${nft.tokenId}"]`);
    await expect(card).toContainText(`NFT #${nft.tokenId}`);
    await expect(card).toContainText('Claimed');
  }
  expect(await machine.locator('[data-machine-winner] img').evaluateAll(images=>images.map(img=>img.getAttribute('src')))).toEqual(immutable);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.hero').screenshot({path:info.outputPath(`machine-claims-${width}.png`)});
  await page.clock.resume();
  expect((await new AxeBuilder({page}).include('.hero').include('.header').analyze()).violations).toEqual([]);
});

test('Rewards machine plays claims after winners and pauses on request, offscreen and in hidden tabs',async({page},info)=>{
  await prepare(page); await page.emulateMedia({reducedMotion:'no-preference'}); await page.goto(`${urls.landing}/rewards`); await ready(page);
  const machine=page.locator('[data-rewards-machine]');
  await expect(machine).toHaveAttribute('data-motion','running');
  // The initial flow must reach a visibly moving VRF request without a long idle pool.
  await page.clock.runFor(3500);
  await expect(machine).toHaveAttribute('data-phase','vrf');
  expect(await machine.locator('[data-machine-proof]').evaluate(node=>Number(getComputedStyle(node).opacity))).toBeGreaterThan(0);
  await page.clock.runFor(1500);
  await expect(machine).toHaveAttribute('data-phase','winners');
  await machine.getByRole('button',{name:'Winners',exact:true}).click();
  const images=await machine.locator('[data-machine-winner] img').evaluateAll(nodes=>nodes.map(node=>node.outerHTML));
  await machine.getByRole('button',{name:'Play animation',exact:true}).click();
  await page.clock.runFor(1200);
  await expect(machine).toHaveAttribute('data-phase','claims');
  const midway=Number(await machine.getAttribute('data-prize-fill'));
  expect(midway).toBeGreaterThan(0);expect(midway).toBeLessThan(1);
  expect(await machine.locator('[data-machine-coin]').evaluateAll(nodes=>nodes.some(node=>Number(getComputedStyle(node).opacity)>0))).toBe(true);
  await page.locator('.hero').screenshot({path:info.outputPath('machine-claims-in-flight.png'),animations:'allow'});
  await machine.getByRole('button',{name:'Pause animation',exact:true}).click();
  const paused=await machine.getAttribute('data-prize-fill');await page.clock.runFor(1000);
  expect(await machine.getAttribute('data-prize-fill')).toBe(paused);
  await machine.getByRole('button',{name:'Play animation',exact:true}).click();await page.clock.runFor(2400);
  await expect(machine).toHaveAttribute('data-prize-fill','0.000');
  await expect(machine.locator('[data-machine-winner][data-claimed="true"]')).toHaveCount(6);
  expect(await machine.locator('[data-machine-winner] img').evaluateAll(nodes=>nodes.map(node=>node.outerHTML))).toEqual(images);
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await expect(machine).toHaveAttribute('data-motion','paused');
  const offscreen=await machine.getAttribute('data-prize-fill');await page.clock.runFor(1500);expect(await machine.getAttribute('data-prize-fill')).toBe(offscreen);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await expect(machine).toHaveAttribute('data-motion','running');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(machine).toHaveAttribute('data-motion','paused');
  await page.evaluate(()=>{delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(machine).toHaveAttribute('data-motion','running');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(machine).toHaveAttribute('data-motion','paused');
  await expect(machine).toHaveAttribute('data-phase','winners');
  await page.clock.runFor(3000);await expect(machine).toHaveAttribute('data-phase','winners');
});

for(const width of [390,1440]) test(`Rewards machine reflows with 200 percent text ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await prepare(page);await page.goto(`${urls.landing}/rewards`);await ready(page);
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.locator('[data-rewards-machine]').getByRole('button',{name:'Claims',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const card of await page.locator('[data-machine-winner]').all()) {
    const bounds=(await card.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  }
  await page.locator('.hero').screenshot({path:info.outputPath(`machine-text-200-${width}.png`)});
});
