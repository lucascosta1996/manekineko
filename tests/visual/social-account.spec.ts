import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, urls } from './fixtures';
const profile = { chainId: '11155111', revision: 2, enabled: false, handle: 'tincta_test', expectedAccountId: '123', publicBaseUrl: 'https://tincta.xyz', credentialsConfigured: true, updatedAt: '2026-10-28T00:00:00Z' };
for (const width of [390, 1440]) test(`X account sign-in, verified save and secret clearing ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await prepare(page);
  let signedIn = false, saves = 0;
  await page.route(/\/api\/(social-account|auth\/session)/, async route => {
    const request = route.request();
    if (request.url().includes('/session')) {
      if (request.method() === 'POST') signedIn = true;
      if (request.method() === 'DELETE') signedIn = false;
      return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { username: 'operator' } : { error: 'Sign in.' } });
    }
    if (!signedIn) return route.fulfill({ status: 401, json: { error: 'Sign in.' } });
    if (request.method() === 'PUT') {
      saves++; const body = request.postDataJSON();
      expect(body.expectedAccountId).toBe('123'); expect(body.credentials.apiKey).toBe('fictional-key'); expect(body.revision).toBe(2);
      return route.fulfill({ json: { profile: { ...profile, revision: 3 } } });
    }
    return route.fulfill({ json: { username: 'operator', profile, encryptionConfigured: true, allowedChainId: '11155111' } });
  });
  await page.goto(`${urls.launch}/social/account`); await page.clock.resume();
  await page.getByRole('link', { name: 'Sign in to Launch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Launch' })).toBeVisible();
  await page.getByLabel('Launch username', { exact: true }).fill('operator'); await page.getByLabel('Launch password', { exact: true }).fill('fictional-password-for-test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // A full authenticated navigation must finish before the account-content assertion.
  await page.waitForURL(/\/social\/account(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Posting account: @tincta_test' })).toBeVisible({ timeout: 30_000 });
  for (const [label, value] of [['Consumer Key (API key)', 'fictional-key'], ['Consumer Secret (API key secret)', 'fictional-secret'], ['Access token', 'fictional-token'], ['Access token secret', 'fictional-token-secret']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Verify and save account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Verified @tincta_test'); expect(saves).toBe(1);
  await expect(page.getByLabel('Consumer Key (API key)', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/x-account-${info.project.name}-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Launch password', { exact: true })).toHaveValue('');
});
test('X account loading, unavailable recovery and network restrictions remain honest', async ({ page }) => {
  await prepare(page); let state: 'loading' | 'error' | 'mainnet' = 'loading'; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/social-account?**', async route => {
    if (state === 'loading') await gate;
    if (state === 'error') return route.fulfill({ status: 503, json: { error: 'Account settings are temporarily unavailable.' } });
    return route.fulfill({ json: { username: 'operator', profile: null, encryptionConfigured: true, allowedChainId: '11155111' } });
  });
  await page.goto(`${urls.launch}/social/account?chainId=1`, { waitUntil: 'domcontentloaded' }); await page.clock.resume();
  await expect(page.getByText('Loading account settings…')).toBeVisible(); await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  state = 'error'; release(); await expect(page.locator('.social-account').getByRole('alert')).toContainText('temporarily unavailable');
  state = 'mainnet'; await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('Account changes for this network are unavailable');
  await expect(page.getByRole('button', { name: 'Verify and save account' })).toBeDisabled();
});
