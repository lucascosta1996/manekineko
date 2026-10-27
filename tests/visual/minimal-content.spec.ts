import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';

for (const width of [390, 1440]) {
  test(`Reward examples and section order ${width}`, async ({ page }, info) => {
    await prepare(page); await page.clock.resume();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(urls.landing + '/rewards'); await ready(page);
    const heroGroup = await page.locator('.hero-main').boundingBox();
    const heroCopy = await page.locator('.hero-copy').boundingBox();
    const heroAction = await page.locator('.hero-actions .ui-button').boundingBox();
    const heroArt = await page.locator('[data-rewards-machine]').boundingBox();
    expect(Math.abs(heroGroup!.x + heroGroup!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(heroAction!.x + heroAction!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    await expect(page.locator('.hero-copy')).toHaveCSS('text-align', 'center');
    const heroDescription = await page.locator('.hero-description').boundingBox();
    expect(Math.abs(heroDescription!.x + heroDescription!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(heroArt!.y).toBeGreaterThan(heroCopy!.y + heroCopy!.height);
    expect(Math.abs(heroArt!.x + heroArt!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    await expect(page.locator('.site main .section-index')).toHaveText(['01 /', '02 /', '03 /', '04 /', '05 /', '06 /', '07 /']);
    const sections = await page.locator('.site main > section:not(.closing-section)').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return [parseFloat(style.paddingTop), parseFloat(style.paddingBottom)];
    }));
    for (const padding of sections) expect(padding).toEqual(width < 600 ? [48, 48] : [80, 80]);
    const separation = await page.locator('#holder-rewards').evaluate(element => {
      const bottom = Math.max(...Array.from(element.children).map(child => child.getBoundingClientRect().bottom));
      const nextTop = Math.min(...Array.from(document.querySelector('#questions')!.children).map(child => child.getBoundingClientRect().top));
      return nextTop - bottom;
    });
    expect(separation).toBeGreaterThanOrEqual(width < 600 ? 96 : 160);
    const metrics = page.locator('.reward-metric');
    await expect(metrics).toHaveCount(3);
    for (const [index, amount] of ['1,296', '432', '216'].entries()) await expect(metrics.nth(index).locator('.metric-number')).toContainText(amount);
    await expect(page.locator('.holder-metric')).toContainText('10,800 claims at 0.02 ETH each');
    await expect(page.locator('#refunds + #holder-rewards')).toHaveCount(1);
    const holderTitle = await page.locator('#holders-title').boundingBox();
    const exampleTitle = await page.locator('.holder-example h3').boundingBox();
    if (width >= 760) {
      expect(Math.abs(holderTitle!.y - exampleTitle!.y)).toBeLessThanOrEqual(1);
      const faq = await page.locator('.faq-list').boundingBox();
      expect(Math.abs(exampleTitle!.x - faq!.x)).toBeLessThanOrEqual(1);
    } else {
      const explanation = await page.locator('.holder-copy').boundingBox();
      expect(exampleTitle!.y).toBeGreaterThan(explanation!.y + explanation!.height);
    }
    expect(await page.locator('#reward-details').evaluate(el => !!(el.compareDocumentPosition(document.querySelector('#manifesto-title')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(page.locator('.holder-calculation')).toContainText('10 ÷ 500 = 0.02 ETH');
    await expect(page.locator('.terms-note')).toContainText('These are not funded balances.');
    for (const selector of ['.reward-rail', '#holder-rewards', 'footer']) await page.locator(selector).screenshot({ path: info.outputPath(`${selector.replace(/\W/g, '')}-${width}.png`) });
    expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([]);
  });
  test(`Public overview points to the full documentation ${width}`, async ({ page }, info) => {
    await prepare(page); await page.clock.resume();
    await page.route('https://api.web3modal.org/appkit/v1/**', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { features: [], planLimits: { tier: 'starter', isAboveMauLimit: false, isAboveRpcLimit: false } } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(urls.web + '/?state=unconfigured'); await ready(page);
    await expect(page.locator('.public-allocation-grid')).toHaveCount(0);
    await expect(page.locator('.public-rules-grid')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Read the Genesis guide', exact: true })).toHaveAttribute('href', '/docs/genesis');
    await expect(page.locator('.public-explainer')).toHaveCount(0);
    await page.locator('.public-primary').screenshot({ path: info.outputPath(`public-rules-${width}.png`) });
    expect((await new AxeBuilder({ page }).include('.public-primary').analyze()).violations).toEqual([]);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
