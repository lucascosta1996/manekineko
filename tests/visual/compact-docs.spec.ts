import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';

for (const width of [320, 390, 768, 1440]) test(`compact header and diagrams survive enlarged text ${width}`, async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Primary engine covers the intermediate sizes.');
  await prepare(page); await page.clock.resume(); await page.setViewportSize({ width, height: 900 });
  for (const slug of ['holder-rewards', 'prizes', 'verification']) {
    await page.goto(`${urls.web}/docs/${slug}`); await ready(page);
    await expect(page.locator('.docs-visual-flow').first()).toBeVisible();
    await expect(page.locator('.docs-visual-formula').first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/\bV\d+\b/);
    await page.locator('.docs-visual-formula').first().screenshot({ path: `test-results/formula-${slug}-${width}-${info.project.name}.png` });
    await page.addStyleTag({ content: 'html { font-size: 200%; } p { line-height: 1.5; letter-spacing: .12em; word-spacing: .16em; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).include('#main').analyze()).violations).toEqual([]);
});

test('navigation fits both sides of its breakpoints and restores focus', async ({ page }) => {
  await prepare(page); await page.clock.resume(); await page.goto(`${urls.web}/docs`); await ready(page);
  for (const width of [320, 599, 600, 601, 1099, 1100, 1101, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('.mint-header').boundingBox())!.height).toBeLessThanOrEqual(57);
    if (width <= 1100) {
      const toggle = page.getByRole('button', { name: 'Open menu' });
      await toggle.click();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
    }
  }
});
