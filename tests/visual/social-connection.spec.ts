import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, urls } from './fixtures';
import { socialPreviewResponse } from '../../apps/launch/lib/social-preview-response';
const connected = { chainId: '11155111', account: { id: '123', username: 'tincta_test' }, checkedAt: '2026-10-28T09:00:00Z' };
for (const width of [320, 390, 768, 1440]) test(`manual X connection test, retry and accessible feedback ${width}`, async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Secondary engines cover phone and desktop.');
  await page.setViewportSize({ width, height: 900 }); await prepare(page);
  await page.route('**/api/social-preview?**', async route => {
    const response = await socialPreviewResponse(new Request(route.request().url()));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  let calls = 0, release!: () => void, mode: 'success' | 'failure' | 'login' = 'success';
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/social-account?**', async route => {
    calls++; expect(route.request().method()).toBe('POST'); expect(route.request().postData()).toBe(null);
    expect(new URL(route.request().url()).searchParams.get('chainId')).toBe('11155111');
    if (calls === 1) await gate;
    await route.fulfill(mode === 'success' ? { json: connected } : { status: mode === 'login' ? 401 : 429, json: { error: 'X is limiting connection checks. Try again later.' } });
  });
  await page.goto(`${urls.launch}/social?chainId=11155111`); await page.clock.resume();
  const panel = page.getByRole('region', { name: 'X connection', exact: true });
  const button = panel.getByRole('button', { name: 'Test X connection', exact: true });
  await expect(button).toBeVisible(); expect(calls).toBe(0);
  const before = await button.boundingBox(); await button.focus(); await page.keyboard.press('Enter');
  const pending = panel.getByRole('button', { name: 'Testing connection…', exact: true });
  await expect(pending).toHaveAttribute('aria-disabled', 'true'); await page.keyboard.press('Enter');
  expect(calls).toBe(1); const during = await pending.boundingBox();
  expect(during?.width).toBe(before?.width); expect(during?.height).toBe(before?.height);
  release(); await expect(panel.getByRole('status')).toContainText('Connected to @tincta_test on Sepolia testnet');
  await expect(panel.getByRole('status')).toContainText('Account ID 123');
  await expect(panel.getByRole('link', { name: 'X account settings' })).toHaveAttribute('href', '/social/account?chainId=11155111');
  await expect(page.locator('.social-preview-frame')).toHaveAttribute('data-status', 'loaded');
  await panel.screenshot({ path: `test-results/x-connection-panel-${info.project.name}-${width}.png` });
  await page.screenshot({ path: `test-results/x-connection-${info.project.name}-${width}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  mode = 'failure'; await button.click(); await expect(panel.getByRole('alert')).toContainText('X is limiting'); await expect(panel.getByRole('status')).toHaveCount(0);
  mode = 'success'; await button.click(); await expect(panel.getByRole('status')).toContainText('Connected'); expect(calls).toBe(3);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  mode = 'login'; await button.click(); await expect(panel.getByRole('link', { name: 'Sign in to Launch' })).toHaveAttribute('href', '/login?next=%2Fsocial%3FchainId%3D11155111');
  await expect(panel.getByRole('status')).toContainText('Your session has ended');
});
test('missing account, wrong network, network errors and timeout remain retryable', async ({ page }) => {
  await prepare(page); let mode = 'missing';
  await page.route('**/api/social-account?**', async route => {
    if (mode === 'network') return route.abort();
    if (mode === 'timeout') return; // The browser-controlled timer ends the pending check.
    return route.fulfill(mode === 'wrong' ? { json: connected } : { status: 409, json: { error: 'Configure the X account for this network first.' } });
  });
  await page.goto(`${urls.launch}/social?chainId=1`); await page.clock.resume();
  const panel = page.getByRole('region', { name: 'X connection', exact: true });
  const button = panel.getByRole('button', { name: 'Test X connection', exact: true });
  await button.click(); await expect(panel.getByRole('alert')).toContainText('Configure the X account');
  mode = 'wrong'; await button.click(); await expect(panel.getByRole('alert')).toContainText('invalid connection result');
  mode = 'network'; await button.click(); await expect(panel.getByRole('alert')).toContainText('could not complete');
  mode = 'timeout'; await button.click(); await page.clock.fastForward(25_001); await expect(panel.getByRole('alert')).toContainText('timed out');
});
