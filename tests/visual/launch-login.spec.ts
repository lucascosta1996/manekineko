import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, urls } from './fixtures';
for (const width of [390, 1440]) test(`Launch login failure, retry and sign-out ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await prepare(page);
  let attempts = 0, release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/session', async route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ json: { signedOut: true } });
    attempts++; if (attempts === 1) { await gate; return route.fulfill({ status: 401, json: { error: 'The login or password is incorrect.' } }); }
    return route.fulfill({ json: { username: 'operator' } });
  });
  await page.goto(`${urls.launch}/login?next=${encodeURIComponent('/dashboard?chainId=1')}`); await page.clock.resume();
  await expect(page.getByRole('navigation', { name: 'Operator navigation' })).toHaveCount(0);
  await page.getByLabel('Launch username', { exact: true }).fill('operator'); await page.getByLabel('Launch password', { exact: true }).fill('fictional-password-for-test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: /Signing in/ })).toBeDisabled();
  release(); await expect(page.locator('.launch-sign-in').getByRole('alert')).toContainText('incorrect'); expect(attempts).toBe(1);
  await expect(page.getByLabel('Launch password', { exact: true })).toHaveValue('');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: `test-results/launch-login-${info.project.name}-${width}.png`, fullPage: true });
  await page.getByLabel('Launch password', { exact: true }).fill('fictional-password-for-retry'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${urls.launch}/dashboard?chainId=1`); expect(attempts).toBe(2);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(`${urls.launch}/login`); await expect(page.getByLabel('Launch password', { exact: true })).toHaveValue('');
});
