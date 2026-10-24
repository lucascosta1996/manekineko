import { test, expect } from '@playwright/test';
import { prepare, ready, urls } from './fixtures';

const surfaces = [
  { name: 'parent', url: urls.landing, edges: ['.studio-header', '.studio-section', '.studio-footer'] },
  { name: 'rewards', url: urls.landing + '/rewards', edges: ['.landing-header', '.hero', '.site > .ui-footer'] },
  { name: 'docs', url: urls.web + '/docs/holder-rewards', edges: ['.mint-header', '.docs-layout', '.ui-footer'] },
  { name: 'collections', url: urls.web + '/collections', edges: ['.mint-header', '.mirror-grid', '.ui-footer'] },
  { name: 'nfts', url: urls.web + '/collections/11155111/0x' + '2'.repeat(40), edges: ['.mint-header', '.mirror-grid', '.ui-footer'] },
  ...['', '/claims', '/affiliates', '/holders'].map(path => ({
    name: path.slice(1) || 'participate', url: urls.web + path + '?state=unconfigured',
    edges: ['.mint-header', '.public-workspace', '.ui-footer'],
  })),
  { name: 'launch', url: urls.launch + '/dashboard?state=unconfigured', edges: ['.operator-header', '.protocol-page', '.operator-footer'] },
];

for (const surface of surfaces) test(`Fluid aligned page edges: ${surface.name}`, async ({ page }, info) => {
  await prepare(page);
  await page.route('https://api.web3modal.org/appkit/v1/**', route => route.fulfill({
    headers: { 'access-control-allow-origin': '*' },
    json: { features: [], planLimits: { tier: 'starter', isAboveMauLimit: false, isAboveRpcLimit: false } },
  }));
  await page.clock.resume();
  await page.goto(surface.url);
  await ready(page);
  for (const width of [320, 390, 768, 1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const gutter = Math.max(16, width * 0.025);
    for (const selector of surface.edges) {
      const box = (await page.locator(selector).first().boundingBox())!;
      expect(Math.abs(box.x - gutter), `${selector} left at ${width}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(width - box.x - box.width - gutter), `${selector} right at ${width}`).toBeLessThanOrEqual(0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`).toBe(true);
    if (surface.name === 'nfts') {
      const columns = await page.locator('.mirror-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(width < 551 ? 1 : width < 851 ? 2 : width < 1600 ? 3 : width < 2100 ? 4 : 5);
    }
    if (surface.name === 'docs') {
      const layout = await page.locator('.docs-prose > section > p').first().evaluate(el => {
        const s = getComputedStyle(el);
        return { width: el.getBoundingClientRect().width, limit: parseFloat(s.maxWidth), article: el.closest('.docs-article')!.getBoundingClientRect().width };
      });
      expect(layout.width).toBeLessThanOrEqual(layout.limit + 0.5);
      if (width >= 1920) expect(layout.article).toBeGreaterThan(layout.width + 200);
    }
    if ([390, 1440, 2560].includes(width)) await page.screenshot({ path: info.outputPath(`${surface.name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '200% text reflow').toBe(true);
});
