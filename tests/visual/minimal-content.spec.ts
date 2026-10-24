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
    const heroArt = await page.locator('.hero-art').boundingBox();
    expect(Math.abs(heroGroup!.x + heroGroup!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(heroAction!.x + heroAction!.width / 2 - heroCopy!.x - heroCopy!.width / 2)).toBeLessThanOrEqual(1);
    if (width >= 760) {
      expect(heroArt!.x).toBeGreaterThan(heroCopy!.x + heroCopy!.width);
      expect(Math.abs(heroCopy!.y + heroCopy!.height / 2 - heroArt!.y - heroArt!.height / 2)).toBeLessThanOrEqual(1);
      expect(heroGroup!.width).toBeLessThanOrEqual(960);
    } else {
      expect(heroArt!.y).toBeGreaterThan(heroAction!.y + heroAction!.height);
      expect(Math.abs(heroArt!.x + heroArt!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    }
    await expect(page.locator('.site main .section-index')).toHaveText(['01 /', '02 /', '03 /', '04 /', '05 /', '06 /', '07 /']);
    const sections = await page.locator('.site main > section:not(.closing-section)').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return [parseFloat(style.paddingTop), parseFloat(style.paddingBottom)];
    }));
    for (const padding of sections) expect(padding).toEqual(width < 600 ? [32, 32] : [48, 48]);
    const separation = await page.locator('#holder-rewards').evaluate(element => {
      const bottom = Math.max(...Array.from(element.children).map(child => child.getBoundingClientRect().bottom));
      const nextTop = Math.min(...Array.from(document.querySelector('#questions')!.children).map(child => child.getBoundingClientRect().top));
      return nextTop - bottom;
    });
    expect(separation).toBeGreaterThanOrEqual(width < 600 ? 64 : 96);
    const metrics = page.locator('.reward-metric');
    await expect(metrics).toHaveCount(3);
    for (const [index, amount] of ['1,296', '432', '172.8'].entries()) await expect(metrics.nth(index).locator('.metric-number')).toContainText(amount);
    await expect(page.locator('.holder-metric')).toContainText('10,800 claims at 0.016 ETH each');
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
    await expect(page.locator('.holder-calculation')).toContainText('8 ÷ 500 = 0.016 ETH');
    await expect(page.locator('.terms-note')).toContainText('These are not funded balances.');
    for (const selector of ['.reward-rail', '#holder-rewards', 'footer']) await page.locator(selector).screenshot({ path: info.outputPath(`${selector.replace(/\W/g, '')}-${width}.png`) });
    expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([]);
  });
  test(`Public rules remain grouped and readable ${width}`, async ({ page }, info) => {
    await prepare(page); await page.clock.resume();
    await page.route('https://api.web3modal.org/appkit/v1/**', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { features: [], planLimits: { tier: 'starter', isAboveMauLimit: false, isAboveRpcLimit: false } } }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(urls.web + '/?state=unconfigured'); await ready(page);
    await expect(page.locator('.public-allocation-grid > div')).toHaveCount(4);
    await page.getByText('How it works · Voting, prizes and refunds', { exact: true }).click();
    await expect(page.locator('.public-rules-grid > section')).toHaveCount(5);
    await expect(page.locator('.public-rules-grid h3')).toHaveText(['1. Vote & mint', '2. Follow the draw', '3. Check refund eligibility', 'Affiliate rewards', 'Season holder rewards']);
    await page.locator('.public-explainer').screenshot({ path: info.outputPath(`public-rules-${width}.png`) });
    expect((await new AxeBuilder({ page }).include('.public-explainer').analyze()).violations).toEqual([]);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
