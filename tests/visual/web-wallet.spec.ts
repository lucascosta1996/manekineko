import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';
import { rpc, installRejectingWallet, A, T } from './v12-rpc';
import { connectWebWallet } from './web-wallet-fixture';

test('Reown connects from the header and survives navigation', async ({ page }) => {
  await prepare(page); await rpc(page, 1); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(urls.web);
  await connectWebWallet(page);
  await expect(page.getByRole('button', { name: `Manage wallet ${A}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeEnabled();
  const requestsBefore = await page.evaluate(() => (window as any).__v12WalletRequests.filter((q: any) => q.method === 'eth_requestAccounts').length);
  for (const label of ['Rewards', 'Affiliates', 'Holders', 'How It Works', 'Participate']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('button', { name: `Manage wallet ${A}` })).toBeVisible();
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
  await expect(page.getByRole('button', { name: `Manage wallet ${T}` })).toBeVisible();
  await page.evaluate(() => (window as any).__v12ChangeChain('0x1'));
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Switch network', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch network', exact: true }).click();
  await page.getByText('Sepolia', { exact: true }).click();
  await expect(page.getByRole('button', { name: `Manage wallet ${T}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__v12Submissions.length)).toBe(0);
});

test('Reown exposes WalletConnect and canceling the selector never connects or signs', async ({ page }) => {
  await prepare(page); await rpc(page, 1);
  await page.route('**/appkit/v1/config?*', route => route.fulfill({ json: { features: [{ id: 'multi_wallet', isEnabled: false, config: false }] } }));
  await page.clock.resume(); await page.goto(urls.web);
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByText('WalletConnect', { exact: true })).toBeVisible();
  await expect(page.getByText('Multi-Wallet Not Enabled', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/header-wallet-reown.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeDisabled();
});

for (const width of [390, 1440]) test(`Tincta wallet menu switches connections and restores focus ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 568 : 900 });
  await prepare(page); await rpc(page, 1); await installRejectingWallet(page);
  await installRejectingWallet(page, T, { name: 'Second fixture wallet', uuid: '34343434-3434-4434-8434-343434343434', rdns: 'invalid.second' });
  await page.route('**/appkit/v1/config?*', route => route.fulfill({ json: { features: [{ id: 'multi_wallet', isEnabled: true, config: true }] } }));
  await page.clock.resume(); await page.goto(urls.web); await connectWebWallet(page);
  const header = page.locator('header.mint-header');
  await expect(header).not.toContainText(/Sepolia|Ethereum|Project preview/);
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(57);
  await page.getByRole('button', { name: /^Manage wallet/ }).click();
  const menu = page.getByRole('dialog', { name: 'Wallets', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Connect another wallet' }).click();
  await page.getByText('Second fixture wallet', { exact: true }).click();
  await expect(page.getByRole('button', { name: `Manage wallet ${T}` })).toBeVisible();
  await page.getByRole('button', { name: /^Manage wallet/ }).click();
  await expect(menu.locator('.wallet-menu-connection')).toHaveCount(2);
  await menu.getByRole('region', { name: 'V12 fixture wallet', exact: true }).getByRole('button', { name: 'Switch', exact: true }).click();
  await expect(menu.getByRole('status')).toHaveText('Active wallet updated.');
  await expect(menu.getByRole('region', { name: 'V12 fixture wallet', exact: true })).toContainText('Active');
  const styles = await menu.evaluate(el => {
    const s = getComputedStyle(el), b = getComputedStyle(el.querySelector('.ui-button')!);
    return { radius: s.borderRadius, background: s.backgroundColor, font: s.fontFamily, buttonFont: b.fontFamily, buttonSize: b.fontSize, buttonRadius: b.borderRadius };
  });
  expect(styles.radius).toBe('3px'); expect(styles.background).toBe('rgb(255, 255, 255)');
  expect(styles.buttonFont).toBe(styles.font); expect(styles.buttonSize).toBe('13px'); expect(styles.buttonRadius).toBe('3px');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/wallet-menu-${width}-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('button', { name: `Manage wallet ${A}` })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__v12Submissions.length)).toBe(0);
  await page.getByRole('button', { name: /^Manage wallet/ }).click();
  await menu.getByRole('button', { name: 'Disconnect all', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeVisible();
});
