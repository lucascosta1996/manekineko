import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { prepare, ready, urls } from './fixtures';
import { visualCollection, visualWallet, visualPrizes, webVisualResponse } from '../../apps/web/test/visual-data';

const mint = `/mint/${visualCollection.id}`;
const nft = `/nfts/${visualCollection.id}/1`;

async function installReadOnlyWallet(page: Page, holdCodeRead = false) {
  await page.addInitScript(({ wallet, holdCodeRead }) => {
    const calls: string[] = [];
    const provider = {
      request: async ({ method }: { method: string }) => {
        calls.push(method);
        if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [wallet];
        if (method === 'eth_chainId') return '0xaa36a7';
        if (holdCodeRead && method === 'eth_getCode') return new Promise((_resolve, reject) => {
          Object.assign(window, { __releaseVisualRead: () => reject(new Error('Visual fixture: contract read unavailable')) });
        });
        throw new Error(`Visual fixture blocks ${method}`);
      },
      on: () => {}, removeListener: () => {},
    };
    Object.assign(window, { __visualWalletCalls: calls });
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
      info: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Visual read-only wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'invalid.visual' }, provider,
    } }));
    window.addEventListener('eip6963:requestProvider', announce);
  }, { wallet: visualWallet, holdCodeRead });
}


test('Web mobile navigation uses a keyboard disclosure and returns focus', async ({ page, browserName }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${urls.web}/seasons`);
  await ready(page);
  const toggle = page.getByRole('button', { name: 'Open menu', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();
  // This macOS WebKit runner uses Option-Tab to include native links in keyboard navigation.
  await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Seasons', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('Documentation search preserves inline empty state and keyboard focus', async ({ page }) => {
  await prepare(page);
  await page.goto(`${urls.web}/docs`);
  await ready(page);
  const search = page.getByRole('searchbox', { name: 'Search reward guides' });
  await search.fill('prizes');
  await expect(page.locator('.docs-search-results a').first()).toBeVisible();
  await search.fill('zzzz-not-a-guide');
  await expect(page.getByText('No matching pages.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
});

test('Wallet lookup validates inline and retains the entered address', async ({ page }) => {
  await prepare(page);
  await page.goto(`${urls.web}/my-nfts`);
  await ready(page);
  await page.getByText('View a wallet by address', { exact: true }).click();
  const address = page.getByRole('textbox', { name: 'Ethereum wallet address' });
  await address.fill('not-an-address');
  await page.getByRole('button', { name: 'View tickets' }).click();
  await expect(address).toHaveValue('not-an-address');
  await expect(address).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#nft-address-error')).toContainText('Enter a valid Ethereum wallet address.');
  await address.fill(visualWallet);
  await page.getByRole('button', { name: 'View tickets' }).click();
  await expect(page.getByRole('region', { name: 'Wallet NFTs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ticket #1', exact: true })).toBeVisible();
  await expect(address).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByText('Public records · viewing never requires a signature')).toBeVisible();
});

test('Wallet picker stays branded when no browser wallet is available', async ({ page }) => {
  await prepare(page);
  await page.goto(`${urls.web}/prizes`);
  await ready(page);
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Choose wallet account' })).toBeVisible();
  await expect(page.getByText('No Ethereum wallet was found.', { exact: false })).toBeVisible();
  const close = page.getByRole('button', { name: 'Close account selector' });
  await expect(close).toHaveClass(/ui-text-action/);
  await close.click();
  await expect(page.getByRole('region', { name: 'Choose wallet account' })).toHaveCount(0);
});

for (const width of [390, 1440]) test(`NFT first-load pending has no retry, then persistent styled error recovers ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page);
  let mode: 'pending' | 'error' | 'loaded' = 'pending';
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route('**/api/nfts/*/*', async route => {
    requests++;
    if (mode === 'pending') await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: mode === 'error' ? 503 : 200, json: mode === 'error' ? { error: 'Fixture unavailable' } : webVisualResponse(route.request().url()) });
  });
  await page.goto(`${urls.web}${nft}`);
  await expect(page.getByText('Loading on-chain artwork')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot(`web-nft-pending-${width}.png`, { fullPage:true });
  mode = 'error'; release?.();
  await expect(page.getByText('Artwork unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true }).first()).toHaveClass(/ui-text-action/);
  await expect(page).toHaveScreenshot(`web-nft-error-${width}.png`, { fullPage:true });
  mode = 'loaded';
  await page.getByRole('button', { name: 'Try again', exact: true }).first().click();
  await expect(page.locator('.nft-detail-art img')).toBeVisible();
  await expect(page.getByText('Artwork unavailable', { exact: true })).toHaveCount(0);
  expect(requests).toBe(2);
  await expect(page).toHaveScreenshot(`web-nft-recovered-${width}.png`, { fullPage:true });
});

test('Permanent V10 artwork stays separate from drawing and refund feedback', async ({ page }) => {
  await prepare(page);
  // Keep the supplied lifecycle fixture stable rather than replacing it with minting data.
  await page.route(`**/api/collections/${visualCollection.id}`, route => route.fulfill({ status: 503, json: { error: 'Held lifecycle fixture' } }));
  await page.goto(`${urls.web}${mint}?state=drawing`);
  await ready(page);
  await expect(page.locator('.ticket-image')).toBeVisible();
  await expect(page.getByText('Illustrative artwork. View your minted ticket for its actual numbers.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Mint ticket/ })).toHaveCount(0);
  await page.goto(`${urls.web}${mint}?state=refundable`);
  await ready(page);
  await expect(page.locator('.ticket-image')).toBeVisible();
  await expect(page.getByText('Refund', { exact: false }).first()).toBeVisible();
});

test('Connected wallet fixture reads NFTs and blocks every signing or mutation method', async ({ page }) => {
  await prepare(page);
  await installReadOnlyWallet(page);
  await page.goto(`${urls.web}/my-nfts`);
  await ready(page);
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Visual read-only wallet' }).click();
  await page.getByRole('button', { name: `View this account ${visualWallet}` }).click();
  await expect(page.getByText('CONNECTED WALLET', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ticket #1', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __visualWalletCalls: string[] }).__visualWalletCalls);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(method => ['eth_accounts', 'eth_requestAccounts', 'eth_chainId'].includes(method))).toBe(true);
});

for (const width of [390, 1440]) test(`Claim availability, held read, duplicate guard and failure feedback ${width}`, async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width, height: 900 });
  await installReadOnlyWallet(page, true);
  await page.route('**/api/prizes?*', route => route.fulfill({ json: visualPrizes }));
  await page.goto(`${urls.web}/prizes`);
  await ready(page);
  await page.clock.resume();
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Visual read-only wallet' }).click();
  await page.getByRole('button', { name: `Use account ${visualWallet}` }).click();
  const action = page.getByRole('button', { name: 'Claim this prize', exact: true });
  await expect(action).toBeEnabled();
  await expect(page).toHaveScreenshot(`web-claim-available-${width}.png`, { fullPage: true });
  const before = await action.boundingBox();
  await action.click();
  const checking = page.getByRole('button', { name: 'Checking this ticket…', exact: true });
  await expect(checking).toHaveAttribute('aria-busy', 'true');
  await expect(checking).toBeDisabled();
  // The page guard also rejects programmatic duplicate activation.
  await checking.dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __visualWalletCalls: string[] }).__visualWalletCalls.filter(method => method === 'eth_getCode').length)).toBe(1);
  const during = await checking.boundingBox();
  expect(Math.abs(before!.width - during!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(before!.height - during!.height)).toBeLessThanOrEqual(1);
  await expect(page).toHaveScreenshot(`web-claim-checking-${width}.png`, { fullPage: true });
  await page.evaluate(() => (window as unknown as { __releaseVisualRead: () => void }).__releaseVisualRead());
  await expect(page.locator('.prize-card [role="status"]')).toContainText('The wallet could not confirm this request.');
  await expect(action).toBeEnabled();
  await expect(page).toHaveScreenshot(`web-claim-read-error-${width}.png`, { fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const calls = await page.evaluate(() => (window as unknown as { __visualWalletCalls: string[] }).__visualWalletCalls);
  expect(calls.every(method => ['eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'eth_getCode'].includes(method))).toBe(true);
});

for (const touch of [false, true]) test(`Web disclosures use shared metrics and keyboard behavior ${touch ? 'coarse' : 'fine'}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 568 }, hasTouch: touch, serviceWorkers:'block', locale:'en-US', timezoneId:'UTC', deviceScaleFactor:1 });
  const page = await context.newPage();
  await prepare(page);
  for (const [path, selector] of [['/my-nfts', '.nft-address-lookup'], ['/docs', '.docs-inline-outline'], [mint, '.mint-allowance details']] as const) {
    await page.goto(`${urls.web}${path}`); await ready(page);
    const details = page.locator(selector), trigger = details.locator(':scope > summary');
    const styles = await trigger.evaluate(element => { const s = getComputedStyle(element); return { display:s.display, min:parseFloat(s.minHeight), marker:s.listStyleType, font:s.fontSize, line:s.lineHeight, weight:s.fontWeight, padding:[s.paddingTop,s.paddingBottom] }; });
    expect(styles).toMatchObject({ display:'flex', marker:'none', font:'15px', line:'24px', weight:'500', padding:['12px','12px'] });
    expect(styles.min).toBeGreaterThanOrEqual(touch ? 44 : 40);
    await trigger.focus(); await page.keyboard.press('Enter'); await expect(details).toHaveAttribute('open', '');
    await page.keyboard.press('Space'); await expect(details).not.toHaveAttribute('open', '');
    await expect(trigger).toBeFocused();
  }
  await context.close();
});

test('Web explanatory copy and metadata use the shared named type roles', async ({ page }) => {
  await prepare(page); await page.goto(`${urls.web}/seasons`); await ready(page);
  const role = (selector:string) => page.locator(selector).first().evaluate(element => { const s=getComputedStyle(element); return [s.fontSize,s.lineHeight,s.fontWeight,s.letterSpacing]; });
  expect(await role('.season-format p')).toEqual(['15px','24px','400','normal']);
  expect(await role('.eyebrow')).toEqual(['12px','18px','400','normal']);
});

for (const width of [390, 1440]) for (const state of ['empty', 'error']) test(`NFT wallet region ${state} ${width}`, async ({ page }) => {
  await prepare(page, state); await page.setViewportSize({ width, height:900 });
  await page.goto(`${urls.web}/my-nfts?state=${state}`); await ready(page);
  if (state === 'empty') await expect(page.locator('.nft-stats dd')).toHaveText(['0', '0', '0', '0']);
  await expect(page).toHaveScreenshot(`web-nft-wallet-${state}-${width}.png`, { fullPage:true });
});

for (const width of [390, 1440]) test(`Stale collection status explains unavailable updates ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await prepare(page);
  await page.route('**/api/clock', route => route.fulfill({ json: { now: '2026-09-28T13:00:00.000Z' } }));
  await page.goto(`${urls.web}${mint}`);
  const activity = page.locator('.collection-activity').first();
  await expect(activity.locator('.lifecycle-badge')).toHaveText('Status unavailable');
  await expect(activity).toContainText('Details below may be out of date.');
  await expect(activity.locator('[data-live="true"], .protocol-countdown')).toHaveCount(0);
  await expect(activity).not.toContainText('Observation delayed');
  await expect(activity).toHaveScreenshot(`collection-stale-${width}.png`);
});
