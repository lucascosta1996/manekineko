import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import { rpc } from './v12-rpc';

const routes = [
  ['landing', '/', 'studio'],
  ['landing', '/rewards', 'rewards'],
  ['landing', '/whitepaper', 'whitepaper'],
  ['web', '/?state=v14', 'genesis'],
  ['web', '/', 'mint'],
  ['web', '/claims', 'claims'],
  ['web', '/affiliates', 'affiliates'],
  ['web', '/holders', 'holders'],
  ['web', '/collections', 'gallery'],
  ['web', '/docs', 'docs'],
  ['launch', '/dashboard', 'operator'],
] as const;

for (const coarse of [false, true]) test.describe(coarse ? 'Touch consumers' : 'Fine pointer consumers', () => {
  test.use({ hasTouch: coarse });
  for (const width of coarse ? [390, 1440] : [320, 390, 768, 1280, 1440, 1920, 2560]) {
  test(`current route control consistency ${width}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Primary engine covers every layout size.');
    await page.setViewportSize({ width, height: 900 });
    await prepare(page); await page.clock.resume();
    for (const [app, path, name] of routes) {
      await page.unroute('https://v12.fixture.invalid/**');
      await rpc(page, name === 'claims' || name === 'holders' ? 5 : 1, false,
        name === 'genesis' ? { genesis: 'open' } : name === 'holders' ? { holderState: 'locked' } : {});
      await page.goto(urls[app] + path);
      if (['genesis', 'mint', 'claims', 'affiliates', 'holders'].includes(name)) {
        const region = name === 'genesis' ? '.genesis-panel' : name === 'mint' ? '.public-stage[data-phase="1"]' : name === 'claims' ? '.public-claim-content' : name === 'affiliates' ? '.public-affiliate-content' : '.holder-pool';
        await expect(page.locator(region)).toBeVisible();
      }
      await ready(page);
      expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches), `${name}: pointer emulation`).toBe(coarse);
      // Chromium's full-page screenshot resets touch emulation. Touch evidence
      // uses the viewport; fine-pointer cases retain full-page captures.
      if (name === 'rewards') await page.getByRole('button', {name: 'View all 22 seasons', exact: true}).click();
      const controls = await page.locator('.ui-button:visible').evaluateAll(elements => elements.map(el => {
        const s = getComputedStyle(el);
        const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const labels: string[] = [];
        while (text.nextNode()) if (text.currentNode.textContent?.trim()) labels.push(getComputedStyle(text.currentNode.parentElement!).fontSize);
        const rect = el.getBoundingClientRect();
        return { label: el.textContent?.trim() || el.getAttribute('aria-label'), icon: el.classList.contains('ui-icon-button'),
          labels, height: rect.height, minHeight: s.minHeight, size: s.fontSize, line: s.lineHeight, weight: s.fontWeight, radius: s.borderRadius,
          padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
          margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft] };
      }));
      await info.attach(`${name}-controls-${width}`, { body: JSON.stringify(controls, null, 2), contentType: 'application/json' });
      if (!process.env.UI_CAPTURE_BEFORE) {
        for (const c of controls) {
          expect(c, `${name}: ${c.label}`).toMatchObject({ size: '13px', line: '18px', weight: '500', radius: '3px',
            padding: c.icon ? Array(4).fill(coarse ? '13px' : '7px') : [coarse ? '12px' : '6px', '12px', coarse ? '12px' : '6px', '12px'],
            margin: ['0px', '0px', '0px', '0px'] });
          expect(c.height, `${name}: ${c.label} target`).toBeGreaterThanOrEqual(coarse ? 44 : 32);
          for (const labelSize of c.labels) expect(labelSize, `${name}: ${c.label} nested text`).toBe('13px');
        }
        const cards = await page.locator('.protocol-panel:visible, .holder-pool:visible, .season-explorer:visible, .prize-panel:visible, .affiliate-panel:visible, .prize-ticket:visible, .docs-callout:visible, .docs-link-card:visible, .docs-visual:visible, .docs-pagination > a:visible, .mirror-card-body:visible, .mirror-message:visible').evaluateAll(elements => elements.map(el => {
          const s = getComputedStyle(el); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
        }));
        for (const padding of cards) expect(padding, `${name}: card padding`).toEqual(Array(4).fill(width < 600 ? '16px' : '20px'));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations, name).toEqual([]);
      }
      await page.screenshot({ path: `test-results/consistency-${process.env.UI_CAPTURE_BEFORE ? 'before' : 'after'}/${info.project.name}-${coarse ? 'touch' : 'fine'}-${name}-${width}.png`, fullPage: !coarse });
      if (width === 320) {
        await page.addStyleTag({content: 'html { font-size: 200%; }'});
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: enlarged text`).toBe(true);
      }
    }
  });
}
});
