import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import { socialPreviewResponse as GET } from '../../apps/launch/lib/social-preview-response';
for (const width of [320, 390, 768, 1440]) test(`Launch social previews, keyboard and PNG ${width}`, async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Secondary engines cover phone and desktop.');
  await page.setViewportSize({ width, height: 900 }); await prepare(page);
  await page.route('**/api/social-preview?**', async route => {
    const response = await GET(new Request(route.request().url()));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(`${urls.launch}/social`); await ready(page); await page.clock.resume();
  await expect(page.getByRole('heading', { name: 'X posts & images' })).toBeVisible();
  await expect(page.locator('.social-preview-copy')).toContainText('first collection starts with voting as soon as Genesis sells out');
  const image = page.locator('.social-preview-image img');
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(image).toHaveAttribute('width', '1600'); await expect(image).toHaveAttribute('height', '900');
  await page.getByRole('combobox', { name: 'Event', exact: true }).click();
  await page.getByRole('option', { name: 'GENESIS SOLD OUT', exact: true }).click();
  await expect(page.locator('.social-preview-copy')).toContainText('All 1,000 free NFTs minted');
  await page.getByRole('combobox', { name: 'Collection', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(217);
  await page.getByRole('option').nth(1).click();
  await expect(page.locator('.social-preview-copy')).toContainText('NFT-holder voting opened');
  await page.getByRole('combobox', { name: 'Event', exact: true }).click();
  await page.getByRole('option', { name: 'SEASON COMPLETE', exact: true }).click();
  await expect(page.locator('.social-preview-copy')).toContainText('Every collection has finalized or reached a refund outcome');
  await expect(page.locator('.social-preview-copy a')).toHaveAttribute('href', /format=png/);
  await page.getByRole('combobox', { name: 'Event', exact: true }).focus();
  await page.keyboard.press('Enter'); await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('combobox', { name: 'Event', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: `test-results/social-${info.project.name}-${width}.png`, fullPage: true });
  await page.clock.resume(); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('social preview validates selections and downloads actual PNG bytes', async () => {
  const png = await GET(new Request('http://local/api/social-preview?collection=0&stage=genesis-open&format=png'));
  expect(png.status).toBe(200); expect(png.headers.get('content-type')).toBe('image/png');
  const bytes = Buffer.from(await png.arrayBuffer()); expect(bytes.readUInt32BE(16)).toBe(1600); expect(bytes.readUInt32BE(20)).toBe(900);
  for (const query of ['chainId=5','collection=217','collection=-1','collection=0&stage=opening','stage=%3Cscript%3E']) expect((await GET(new Request(`http://local/api/social-preview?${query}`))).status).toBe(400);
});
test('image failure has an honest recovery link and does not erase post text', async ({ page }) => {
  await prepare(page); await page.route('**/api/social-preview?**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(`${urls.launch}/social`); await ready(page); await page.clock.resume();
  await expect(page.getByText('Image preview unavailable.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open image', exact: true })).toBeVisible();
  await expect(page.locator('.social-preview-copy')).toContainText('Genesis sells out');
});

test('held image response preserves the preview frame and recovery copy at enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/social-preview?**', async route => {
    await gate;
    const response = await GET(new Request(route.request().url()));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(`${urls.launch}/social`, { waitUntil: 'domcontentloaded' }); await page.clock.resume();
  await expect(page.getByText('Loading image preview…')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open image', exact: true })).toHaveCount(0);
  const before = await page.locator('.social-preview-frame').boundingBox();
  release(); await expect(page.locator('.social-preview-frame')).toHaveAttribute('data-status', 'loaded');
  const after = await page.locator('.social-preview-frame').boundingBox(); expect(after?.height).toBe(before?.height);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});
