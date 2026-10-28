import { test, expect } from '@playwright/test';

// Run against `npm run dev:launch`: production fixtures do not replay renders in Strict Mode.
const origin = process.env.LAUNCH_DEV_URL;
const storageState = process.env.LAUNCH_DEV_STORAGE_STATE;
test.use({ storageState });
if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error('Launch development checks require a loopback origin.');

for (const chainId of [1, 11155111]) test(`development collection selections keep valid image identities on ${chainId}`, async ({ page }) => {
  test.skip(!origin || !storageState, 'Set LAUNCH_DEV_URL and a private authenticated LAUNCH_DEV_STORAGE_STATE for the running Launch server.');
  // These previews are read-only: deny all other APIs, external requests and mutations.
  await page.context().route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET' || (url.pathname.startsWith('/api/') && url.pathname !== '/api/social-preview')) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(`${origin}/social?chainId=${chainId}`);
  await expect(page.locator('.social-preview-frame')).toHaveAttribute('data-status', 'loaded');
  const collection = page.getByRole('combobox', { name: 'Collection', exact: true });
  for (const id of [1, 216, 0, 2, 0]) {
    await collection.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(217);
    const label = await options.nth(id).innerText();
    await options.nth(id).click();
    await expect(collection).toHaveText(label);
    await expect(page.locator('.social-preview-frame')).toHaveAttribute('data-status', 'loaded');
    const image = page.locator('.social-preview-image img');
    await expect(image).toHaveAttribute('src', `/api/social-preview?chainId=${chainId}&collection=${id}&stage=${id === 0 ? 'genesis-open' : 'voting'}`);
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Launch is unavailable.' })).toHaveCount(0);
  }
});
