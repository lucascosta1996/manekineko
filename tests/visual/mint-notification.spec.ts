import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, browserErrors } from './fixtures';

const genesis = { chainId:11155111,collection:'0x'+'a'.repeat(40),transaction:'0x'+'1'.repeat(64),name:'Tincta Genesis',kind:'genesis',tokenId:51 };
const paid = {...genesis,chainId:1,collection:'0x'+'b'.repeat(40),transaction:'0x'+'2'.repeat(64),name:'Lunar Stone',kind:'paid',tokenId:20};
async function feed(page: Page) {
  let events: unknown[] = [genesis], status = 200, calls = 0;
  await prepare(page);
  await page.route('**/api/mint-activity', route => { calls++; return route.fulfill({status,json:{events}}); });
  return { set: (next: unknown[], code=200) => { events=next; status=code; }, calls: () => calls };
}
const bar = (page: Page) => page.getByRole('complementary', {name:'Mint activity'});
async function tick(page: Page, ms=15_000) { await page.clock.runFor(ms); }

for (const [site, path] of [['landing','/'],['landing','/rewards'],['web','/docs']] as const) {
  test(`confirmed activity on ${site}${path}: baseline, Genesis, collection, deduplication and hide`, async ({page}) => {
    const source = await feed(page);
    await page.goto(`${urls[site]}${path}`); await ready(page);
    await expect.poll(source.calls).toBe(1); await expect(bar(page)).toBeHidden();
    const next = {...genesis,tokenId:52,transaction:'0x'+'3'.repeat(64)};
    source.set([next,genesis]); await tick(page);
    await expect(bar(page)).toContainText('Tincta Genesis #52');
    await expect(bar(page)).toContainText('Sepolia testnet');
    await expect(bar(page).getByRole('link')).toHaveAttribute('href',`https://sepolia.etherscan.io/tx/${next.transaction}`);
    await bar(page).getByRole('link').focus(); await tick(page,9_000);
    await expect(bar(page)).toBeVisible(); // Keyboard interaction keeps the link available.
    await page.locator('h1').first().click(); await tick(page,8_001);
    await expect(bar(page)).toBeHidden();
    await tick(page); await expect(bar(page)).toBeHidden(); // Same transaction is not repeated.
    source.set([paid,next,genesis]); await tick(page);
    await expect(bar(page)).toContainText('Lunar Stone #20');
    await expect(bar(page)).not.toContainText('Sepolia');
    await expect(bar(page).getByRole('link')).toHaveAttribute('href',`https://etherscan.io/tx/${paid.transaction}`);
    await bar(page).getByRole('button', {name:'Hide mint notifications for this visit'}).click();
    await expect(bar(page)).toBeHidden();
    const before = source.calls(); await page.reload(); await ready(page); await tick(page,30_000);
    expect(source.calls()).toBe(before); expect(browserErrors.get(page)).toEqual([]);
  });
}

for (const width of [320,390,768,1440]) {
  test(`mint bar geometry and accessibility ${width}`, async ({page},info) => {
    test.skip(info.project.name !== 'chromium' && ![390,1440].includes(width), 'Other engines cover phone and desktop.');
    await page.setViewportSize({width,height:900}); const source=await feed(page);
    source.set([]); await page.goto(`${urls.landing}/rewards#genesis`); await ready(page);
    await expect.poll(source.calls).toBe(1);
    source.set([{...genesis,name:'Tincta Genesis — the first community collection'}]); await tick(page);
    await expect(bar(page)).toBeVisible();
    expect(await bar(page).evaluate(el => {const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.clock.resume();
    expect((await new AxeBuilder({page}).include('.ui-mint-notification').analyze()).violations).toEqual([]);
    await page.screenshot({path:`test-results/mint-bar-${width}-${info.project.name}.png`});
    await page.addStyleTag({content:'html {font-size:200%}'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(bar(page).getByRole('button')).toBeVisible();
  });
}

test('unavailable or malformed feeds stay quiet and tab return establishes a fresh baseline',async({page})=>{
  const source=await feed(page); source.set([],503);
  await page.goto(`${urls.landing}/rewards`); await ready(page); await expect.poll(source.calls).toBe(1);
  await expect(bar(page)).toBeHidden();
  source.set([{...genesis,transaction:'javascript:alert(1)'}]); await tick(page); await expect(bar(page)).toBeHidden();
  source.set([genesis]); await tick(page); await expect(bar(page)).toBeHidden();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  const before=source.calls(); source.set([paid,genesis]); await tick(page,30_000); expect(source.calls()).toBe(before);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(source.calls).toBe(before+1); await expect(bar(page)).toBeHidden();
  source.set([{...genesis,tokenId:52,transaction:'0x'+'3'.repeat(64)},paid,genesis]); await tick(page);
  await expect(bar(page)).toContainText('Tincta Genesis #52');
  expect(browserErrors.get(page)).toEqual([]);
});

test('touch targets use shared 44px controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),source=await feed(page); source.set([]);
  try {
    await page.goto(`${urls.landing}/rewards`); await ready(page); await expect.poll(source.calls).toBe(1);
    source.set([genesis]); await tick(page);
    for (const role of ['button','link'] as const) expect((await bar(page).getByRole(role).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  } finally {await context.close();}
});
