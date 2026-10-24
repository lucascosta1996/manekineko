import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';
import { rpc, installRejectingWallet, A, T } from './v12-rpc';
import { connectWebWallet } from './web-wallet-fixture';

test('Reown connects from the header and survives navigation', async ({ page }) => {
  await prepare(page); await rpc(page, 1); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(urls.web);
  await connectWebWallet(page);
  await expect(page.getByRole('button', { name: `Manage wallet ${A} on Sepolia testnet` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeEnabled();
  const requestsBefore = await page.evaluate(() => (window as any).__v12WalletRequests.filter((q: any) => q.method === 'eth_requestAccounts').length);
  for (const label of ['Rewards', 'Affiliates', 'Holders', 'How It Works', 'Participate']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('button', { name: `Manage wallet ${A} on Sepolia testnet` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toHaveCount(0);
  }
  expect(await page.evaluate(() => (window as any).__v12WalletRequests.filter((q: any) => q.method === 'eth_requestAccounts').length)).toBe(requestsBefore);
  expect(await page.evaluate(() => (window as any).__v12Submissions.length)).toBe(0);
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Manage wallet/ })).toBeVisible();
  await page.getByRole('button', { name: /^Manage wallet/ }).click();
  await expect(page.getByText('Disconnect', { exact: true })).toBeVisible();
  await page.getByText('Disconnect', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeDisabled();
  await ready(page);
});

for (const [width, height] of widths) test(`header wallet and responsive menu ${width}`, async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Primary engine covers all sizes.');
  await page.setViewportSize({ width, height });
  await prepare(page); await rpc(page, 1); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(urls.web);
  await ready(page);
  await expect(page.locator('header').getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await connectWebWallet(page);
  await page.getByRole('button', { name: 'Mint tickets', exact: true }).waitFor();
  if (width <= 1100) {
    const before = await page.locator('main').boundingBox();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    const after = await page.locator('main').boundingBox();
    expect(after!.y).toBeGreaterThan(before!.y);
    await expect(page.getByRole('button', { name: /^Manage wallet/ })).toBeVisible();
    await page.screenshot({ path: `test-results/header-wallet-menu-${width}-${info.project.name}.png` });
    await nav.getByRole('link', { name: 'How It Works' }).click();
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  } else await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'How It Works' }).click();
  await expect(page.getByRole('button', { name: /^Manage wallet/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/header-wallet-${width}-${info.project.name}.png` });
  await ready(page);
});

test('account and network changes cancel old reviews and block mismatched transactions', async ({ page }) => {
  await prepare(page); await rpc(page, 1); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(urls.web); await connectWebWallet(page);
  await page.getByRole('button', { name: 'Mint tickets', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.evaluate(address => (window as any).__v12ChangeAccount(address), T);
  await page.getByRole('button', { name: 'Continue to wallet' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reconnect your wallet before continuing.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__v12Submissions.length)).toBe(0);
  await expect(page.getByRole('button', { name: `Manage wallet ${T} on Sepolia testnet` })).toBeVisible();
  await page.evaluate(() => (window as any).__v12ChangeChain('0x1'));
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Switch network', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch network', exact: true }).click();
  await page.getByText('Sepolia', { exact: true }).click();
  await expect(page.getByRole('button', { name: `Manage wallet ${T} on Sepolia testnet` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__v12Submissions.length)).toBe(0);
});

test('Reown exposes WalletConnect and canceling the selector never connects or signs', async ({ page }) => {
  await prepare(page); await rpc(page, 1); await page.clock.resume(); await page.goto(urls.web);
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByText('WalletConnect', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/header-wallet-reown.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeDisabled();
});
