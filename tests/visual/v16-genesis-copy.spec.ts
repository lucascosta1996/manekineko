import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, metrics } from './fixtures';
import { rpc } from './v12-rpc';

for (const width of [320, 390, 599, 600, 601, 719, 720, 721, 768, 1280, 1440]) {
  test(`Genesis launch rules, affiliate utility and deployment boundary ${width}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Secondary engines cover phone and desktop.');
    await page.setViewportSize({ width, height: 900 });
    await prepare(page); await page.clock.resume();
    await page.goto(`${urls.landing}/rewards`); await ready(page);
    const genesis = page.locator('#genesis');
    await genesis.scrollIntoViewIfNeeded();
    await expect(genesis).toContainText('Up to two lifetime mints per wallet. No mint deadline.');
    await expect(genesis).toContainText('The first season starts only after Genesis sells out.');
    await expect(genesis).toContainText('requires Genesis for the first collection');
    await expect(genesis).toContainText('later collections and seasons accept Genesis or eligible paid NFTs');
    await expect(genesis).toContainText('current Sepolia test uses earlier rules');
    await expect(genesis).not.toContainText('24-hour');
    await expect(genesis).not.toContainText('no prize, affiliate');
    const rules = genesis.getByRole('link', { name: 'Read Genesis rules' });
    await expect(rules).toHaveAttribute('href', `${urls.web}/docs/onchain-voting#genesis`);
    const button = await metrics(page, '#genesis .ui-button');
    expect(button.size).toBe('13px'); expect(button.line).toBe('18px');
    expect(button.padding).toEqual(['6px', '12px', '6px', '12px']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('#genesis').analyze()).violations).toEqual([]);
    await genesis.screenshot({ path: `test-results/v16-genesis-${width}-${info.project.name}.png` });
    await page.getByText('How can I vote before the first paid collection?', { exact: true }).click();
    await expect(page.locator('#questions')).toContainText('The first collection requires Genesis; later collections also accept eligible paid NFTs.');
    await rules.focus(); await page.keyboard.press('Enter'); await ready(page);
    await expect(page).toHaveURL(/\/docs\/onchain-voting#genesis$/);
    await expect(page.getByText(/If Genesis never sells out, the first season never starts/)).toBeVisible();
    await expect(page.getByText(/at least 500 minting wallets, not necessarily 500 distinct people/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/v16-voting-guide-${width}-${info.project.name}.png` });
    await page.goto(`${urls.web}/docs/affiliates`); await ready(page);
    await expect(page.getByText(/first paid collection requires a Genesis NFT/)).toBeVisible();
    await expect(page.getByText(/Each NFT can qualify one wallet per target collection/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(urls.landing); await ready(page);
    await expect(page.locator('.studio-feature')).toContainText('Up to two lifetime mints per wallet');
    await expect(page.locator('.studio-feature')).toContainText('affiliate eligibility across all collections and seasons');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.studio-feature').screenshot({ path: `test-results/v16-parent-${width}-${info.project.name}.png` });
  });
}

test('Genesis planned launch copy remains readable with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 }); await prepare(page); await page.clock.resume();
  await page.goto(`${urls.landing}/rewards#genesis`); await ready(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.locator('#genesis')).toContainText('No mint deadline');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('#genesis').getByRole('link', { name: 'Read Genesis rules' }).focus();
  await expect(page.locator('#genesis').getByRole('link', { name: 'Read Genesis rules' })).toBeFocused();
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`App shows launch rules separately from connected test limits ${width}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Secondary engines cover phone and desktop.');
    await page.setViewportSize({ width, height: 900 }); await prepare(page); await page.clock.resume();
    for (const route of ['/', '/affiliates']) {
      await page.goto(`${urls.web}${route}?state=unconfigured`); await ready(page);
      const rules = page.getByRole('region', { name: 'Genesis launch rules' });
      await expect(rules).toContainText('Two per wallet');
      await expect(rules).toContainText('No mint deadline');
      await expect(rules).toContainText('If Genesis never sells out, the first season never starts.');
      await expect(rules).toContainText('The first collection requires Genesis.');
      await expect(rules).toContainText('Later collections accept Genesis or an eligible NFT');
      await expect(page.getByRole('button', { name: 'Mint free NFT', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await rules.screenshot({ path: `test-results/v16-app-rules-${route === '/' ? 'home' : 'affiliates'}-${width}-${info.project.name}.png` });
    }
    await rpc(page, 0, false, { genesis: 'open' });
    await page.goto(`${urls.web}/?state=v14`); await ready(page);
    await expect(page.locator('.genesis-panel')).toContainText('Connected test collection · original rules.');
    await expect(page.locator('.genesis-panel')).toContainText('1 mint per wallet, for life');
    await expect(page.getByRole('region', { name: 'Genesis launch rules' })).toContainText('Two per wallet');
    await expect(page.getByRole('button', { name: 'Mint free NFT', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
