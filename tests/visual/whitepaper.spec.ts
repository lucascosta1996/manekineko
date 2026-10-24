import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';

for (const [width, height] of [...widths, [1920, 1080], [2560, 1440]]) {
  test(`whitepaper reading layout ${width}`, async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium' && ![390, 1440].includes(width));
    await page.setViewportSize({ width, height });
    await prepare(page);
    await page.goto(`${urls.landing}/whitepaper`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tincta Autonomous Standard');
    await expect(page.getByRole('article')).toBeVisible();
    await expect(page.locator('.paper-section')).toHaveCount(13);
    await expect(page.locator('.paper-status')).toContainText('no assigned ERC or EIP number');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`whitepaper-${width}.png`), fullPage: true });
    await page.clock.resume();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('whitepaper is discoverable, navigable, and printable', async ({ page }) => {
  await prepare(page);
  await page.goto(urls.landing);
  await ready(page);
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Whitepaper' }).click();
  await ready(page);
  await expect(page).toHaveURL(/\/whitepaper$/);
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Whitepaper' })).toHaveAttribute('aria-current', 'page');
  const contents = page.getByRole('navigation', { name: 'Whitepaper contents' });
  for (const link of await contents.getByRole('link').all()) {
    const href = await link.getAttribute('href');
    await expect(page.locator(href!)).toHaveCount(1);
  }
  await contents.getByRole('link', { name: 'A discoverable interface' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#interface$/);
  await expect(page.getByRole('heading', { name: 'A discoverable interface' })).toBeInViewport();
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printRequested = 'true'; }; });
  await page.getByRole('button', { name: 'Print whitepaper' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.paper-sidebar')).toBeHidden();
  await expect(page.getByRole('article')).toBeVisible();
  await expect(page.locator('.studio-header')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 568 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Whitepaper' })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.locator('.studio-brand').click();
  await expect(page).toHaveURL(`${urls.landing}/`);
});

test('whitepaper reflows with text enlargement and user preferences', async ({ page }) => {
  await prepare(page);
  await page.goto(`${urls.landing}/whitepaper`);
  await ready(page);
  for (const width of [320, 599, 600, 601, 759, 760, 761, 959, 960, 961]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: 'html{font-size:200%} :where(p,span,a,code){line-height:1.5;letter-spacing:.12em;word-spacing:.16em}p{margin-block-end:2em}' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('whitepaper content and section links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${urls.landing}/whitepaper`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('navigation', { name: 'Whitepaper contents' }).getByRole('link', { name: 'Assets & invariants' }).click();
  await expect(page).toHaveURL(/#assets$/);
  await expect(page.getByRole('heading', { name: 'Assets & invariants' })).toBeInViewport();
  await context.close();
});
