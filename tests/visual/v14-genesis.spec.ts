import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import { rpc, installRejectingWallet } from './v12-rpc';
import { connectWebWallet } from './web-wallet-fixture';
test.use({ trace: 'on', video: 'on' });
for (const width of [320, 390, 758, 759, 760, 768, 1280, 1440]) {
  test(`V14 free mint and operator waiting phase ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page); await rpc(page, 0, false, { genesis: 'open' }); await page.clock.resume();
    await page.goto(`${urls.web}/?state=v14`); await ready(page);
    await expect(page.getByRole('heading', { name: 'Tincta Genesis', exact: true })).toBeVisible();
    await expect(page.getByText('0 ETH + network gas', { exact: true })).toBeVisible();
    await expect(page.getByText('128 / 1000', { exact: true })).toBeVisible();
    await expect(page.getByText('Only for the first vote.', {exact: true})).toBeVisible();
    await expect(page.getByText(/For future votes, you’ll need NFTs from successfully revealed paid season collections/)).toBeVisible();
    expect(await page.locator('.genesis-artwork img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.locator('.public-primary').evaluate(el => el.getBoundingClientRect().height >= innerHeight)).toBe(true);
    await expect(page.getByRole('button', { name: 'Mint free NFT', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/v14-genesis-${width}-${info.project.name}.png`, fullPage: true });
    await page.goto(`${urls.launch}/dashboard?state=v14`); await ready(page);
    await expect(page.getByRole('heading', { name: 'Before the first season' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prepare the next collection', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.operator-shell').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/v14-operator-${width}-${info.project.name}.png`, fullPage: true });
  });
}
for (const phase of ['closed', 'full'] as const) test(`V14 ${phase} free mint cannot sign`, async ({ page }) => {
  await prepare(page); await rpc(page, 0, false, { genesis: phase }); await page.clock.resume();
  await page.goto(`${urls.web}/?state=v14`); await ready(page);
  await expect(page.getByRole('button', { name: 'Mint free NFT', exact: true })).toBeDisabled();
  await expect(page.getByText(phase === 'closed' ? 'The free mint has ended. The first paid ballot is next.' : 'All free NFTs have been minted. The first paid ballot can be prepared after the 24-hour window ends.')).toBeVisible();
});
test('V14 bad Genesis pin fails closed and retry recovers', async ({ page }) => {
  await prepare(page); await rpc(page, 0, false, { genesis: 'open', genesisBadPin: true }); await page.clock.resume();
  await page.goto(`${urls.web}/?state=v14`);
  await expect(page.locator('.protocol-panel[role=alert]')).toContainText('free mint contract could not be verified');
  await expect(page.getByRole('button', { name: 'Mint free NFT', exact: true })).toHaveCount(0);
  expect(await page.locator('.public-primary').evaluate(el => el.getBoundingClientRect().height >= innerHeight)).toBe(true);
  await page.unroute('https://v12.fixture.invalid/**');
  await rpc(page, 0, false, { genesis: 'open' });
  await page.getByRole('button', { name: 'Retry network read' }).click();
  await expect(page.getByRole('heading', { name: 'Tincta Genesis', exact: true })).toBeVisible();
});
test('V14 zero-value review and wallet rejection cannot submit a duplicate free mint', async ({ page }) => {
  await prepare(page); await rpc(page, 0, false, { genesis: 'open' }); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(`${urls.web}/?state=v14`); await connectWebWallet(page); await ready(page);
  await page.getByRole('button', { name: 'Mint free NFT', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('0 ETH');
  await expect(page.getByRole('alertdialog')).toContainText('first paid collection');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Continue to wallet' }).click();
  await expect(page.getByRole('status').filter({ hasText: /declined/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__v12Submissions?.length ?? 0)).toBe(1);
});
test('V14 used primary mint stays unavailable and first paid ballot explains Genesis rights', async ({ page }) => {
  await prepare(page); await rpc(page, 0, false, { genesis: 'open', genesisMinted: true }); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(`${urls.web}/?state=v14`); await connectWebWallet(page);
  await expect(page.getByRole('button', { name: 'Free NFT minted', exact: true })).toBeDisabled();
  await page.unroute('https://v12.fixture.invalid/**');
  await rpc(page, 0, false, { genesis: 'ballot', holderState: 'locked' }); await page.reload();
  await expect(page.getByRole('heading', { name: 'Cast your vote', exact: true })).toBeVisible();
  await page.getByText('Voting eligibility & rules', { exact: true }).click();
  await expect(page.getByText(/Tincta Genesis NFTs qualify for this first paid ballot only/)).toBeVisible();
});

test('V14 mint closing during review never requests a wallet signature', async ({ page }) => {
  await prepare(page); await rpc(page, 0, false, { genesis: 'open' }); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(`${urls.web}/?state=v14`); await connectWebWallet(page);
  await page.getByRole('button', { name: 'Mint free NFT', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.unroute('https://v12.fixture.invalid/**');
  await rpc(page, 0, false, { genesis: 'closed' });
  await page.getByRole('button', { name: 'Continue to wallet' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The free mint is closed.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__v12Submissions.length)).toBe(0);
});
for (const width of [390, 1440]) test(`V14 documentation and landing explain first-only free votes ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await prepare(page); await page.clock.resume();
  await page.goto(`${urls.web}/docs/onchain-voting`); await ready(page);
  await expect(page.getByRole('heading', { name: /^The free mint before the first season/ })).toBeVisible();
  await expect(page.getByText(/Genesis votes expire after this first paid ballot/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/v14-docs-${width}-${info.project.name}.png`, fullPage: true });
  await page.goto(`${urls.landing}/rewards`); await ready(page);
  await page.getByText('How can I vote before the first paid collection?', { exact: true }).click();
  await expect(page.getByText(/Tincta Genesis has two utilities/)).toBeVisible();
  await expect(page.locator('#genesis .genesis-artwork img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('#questions').analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/v14-landing-faq-${width}-${info.project.name}.png` });
});

for (const width of [390, 1440]) test(`Viewport reservation and centered first read ${width}`, async ({page}, info) => {
  await page.setViewportSize({width, height:900}); await prepare(page);
  await rpc(page, 0, false, {genesis:'open'}); await page.clock.resume();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release=resolve;});
  await page.route('https://v12.fixture.invalid/**', async route => {await gate; await route.fallback();});
  await page.goto(`${urls.web}/?state=v14`);
  const loading = page.getByRole('status').filter({hasText:'Reading the collection contracts'});
  await expect(loading).toBeVisible();
  const metrics = await loading.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return {center: rect.x + rect.width / 2, viewport: innerWidth, align: getComputedStyle(el).textAlign};
  });
  expect(metrics.align).toBe('center'); expect(Math.abs(metrics.center - metrics.viewport/2)).toBeLessThan(1);
  const pendingHeight = await page.locator('.public-primary').evaluate(el => el.getBoundingClientRect().height);
  expect(pendingHeight).toBeGreaterThanOrEqual(900);
  const shortcuts = await page.locator('.public-shortcuts').boundingBox();
  await page.screenshot({path:`test-results/v14-loading-${width}-${info.project.name}.png`,fullPage:true});
  release();
  await expect(page.getByRole('heading',{name:'Tincta Genesis',exact:true})).toBeVisible();
  if (width === 1440) expect(Math.abs((await page.locator('.public-shortcuts').boundingBox())!.y - shortcuts!.y)).toBeLessThanOrEqual(1);
  expect(await page.locator('.public-primary').evaluate(el => el.getBoundingClientRect().height >= innerHeight)).toBe(true);
});

test('Genesis stays readable with enlarged text and a short mobile viewport', async ({page}) => {
  await page.setViewportSize({width:320,height:568}); await prepare(page);
  await rpc(page,0,false,{genesis:'open'}); await page.clock.resume();
  await page.goto(`${urls.web}/?state=v14`); await ready(page);
  await page.addStyleTag({content:'html{font-size:200%}'});
  await expect(page.getByText('Only for the first vote.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('link',{name:'Read free mint contract',exact:true}).focus();
  await expect(page.getByRole('link',{name:'Read free mint contract',exact:true})).toBeFocused();
  expect(await page.locator('.public-primary').evaluate(el=>el.getBoundingClientRect().height >= innerHeight)).toBe(true);
});

for (const width of [390, 1440]) test(`Approved Genesis artwork across public pages ${width}`, async ({page}, info) => {
  await page.setViewportSize({width, height:900}); await prepare(page); await page.clock.resume();
  for (const [url, selector, label] of [
    [`${urls.landing}/`, '.studio-genesis-art', 'studio'],
    [`${urls.landing}/rewards#genesis`, '#genesis', 'rewards'],
    [`${urls.web}/docs/onchain-voting#genesis`, '.docs-genesis-preview', 'docs'],
  ]) {
    await page.goto(url); await ready(page); const panel = page.locator(selector);
    await panel.scrollIntoViewIfNeeded();
    expect(await panel.locator('img').evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include(selector).analyze()).violations).toEqual([]);
    await panel.screenshot({path:`test-results/v14-approved-${label}-${width}-${info.project.name}.png`});
  }
});
