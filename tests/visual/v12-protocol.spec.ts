import { connectWebWallet } from "./web-wallet-fixture";
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Interface, toQuantity, parseEther } from 'ethers';
import { prepare, ready, urls } from './fixtures';
import { rpc, C, V, W, R, A, T, H, installRejectingWallet } from './v12-rpc';
import ca from '../../packages/contracts/src/ManekinekoSeasonControllerV12.json';
import ra from '../../packages/contracts/src/ManekinekoRoundV12.json';
import va from '../../packages/contracts/src/ManekinekoVotingV12.json';
for (const width of [320, 390, 768, 1280, 1440])
  for (const [route, phase] of [
    ['', 0],
    ['', 1],
  ] as const)
    test(`V12 home phase ${phase} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await prepare(page);
      await rpc(page, phase);
      await page.clock.resume();
      await page.goto(`${urls.web}/${route}`);
      await expect(page.getByRole('heading', { name: 'Fictional voting study' })).toBeVisible();
      await ready(page);
      await expect(page.locator('.public-allocation-grid dt')).toHaveText([
        '60% · Winning tickets', '20% · Qualified affiliates', '20% · Protocol treasury',
      ]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (phase === 0) {
        await expect(page.getByRole('button', { name: 'Vote for option 1' })).toBeDisabled();
        await expect(
          page.getByText('Connect to see your snapshot voting power.', { exact: false })
        ).toBeVisible();
      }
      if (phase === 1)
        await expect(page.getByRole('button', { name: 'Mint tickets', exact: true })).toBeDisabled();
      const a = await new AxeBuilder({ page }).include('.protocol-page').analyze();
      expect(a.violations).toEqual([]);
      await page.screenshot({ path: `test-results/v12-home-${phase}-${width}.png`, fullPage: true });
      if (phase === 1 && width === 1440 && info.project.name === 'chromium') {
        await page.screenshot({ path: 'test-results/v12-home-mint-preview.png', fullPage: false, scale: 'css' });
      }
    });
test('V12 invalid deployment pins suppress all actions and permit retry', async ({ page }) => {
  await prepare(page);
  await rpc(page, 0, true);
  await page.clock.resume();
  await page.goto(`${urls.web}/`);
  await expect(page.locator('.protocol-page [role=alert]')).toContainText('deployment could not be verified');
  await expect(page.getByRole('button', { name: 'Vote for option 1' })).toHaveCount(0);
  await page.unroute('https://v12.fixture.invalid/**');
  await rpc(page);
  await page.getByRole('button', { name: 'Retry network read' }).click();
  await expect(page.getByRole('heading', { name: 'Fictional voting study' })).toBeVisible();
});
test('V12 unconfigured route explains deployment without offering stale flows', async ({ page }) => {
  await prepare(page);
  await page.goto(`${urls.web}/?state=unconfigured`);
  await ready(page);
  await expect(page.getByRole('link', { name: 'Read how onchain seasons work' })).toHaveAttribute('href', '/docs/onchain-voting');
});
test('V12 simulated wallet reviews an exact ballot and rejected signatures are not retried', async ({
  page,
}) => {
  await prepare(page);
  await rpc(page);
  await page.clock.resume();
  await installRejectingWallet(page);
  await page.goto(`${urls.web}/`);
  await expect(page.getByRole('heading', { name: 'Fictional voting study' })).toBeVisible();
  await connectWebWallet(page, A);
  const vote = page.getByRole('button', { name: 'Vote for option 1' });
  await expect(vote).toBeEnabled();
  await vote.click();
  await expect(page.getByRole('alertdialog')).toContainText('Votes cannot be changed');
  expect(
    await page.evaluate(() => (window as unknown as { __v12Submissions: unknown[] }).__v12Submissions.length)
  ).toBe(0);
  await page.getByRole('button', { name: 'Continue to wallet' }).click();
  await expect(vote).toBeEnabled();
  const sent = await page.evaluate(
    () => (window as unknown as { __v12Submissions: { to: string; data: string }[][] }).__v12Submissions
  );
  expect(sent).toHaveLength(1);
  expect(sent[0][0].to.toLowerCase()).toBe(V);
  const call = new Interface(va).parseTransaction(sent[0][0]);
  expect(call?.name).toBe('castVote');
  expect(call?.args[0].toLowerCase()).toBe(T);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tincta:v12:')).length)
  ).toBe(0);
});
test('any wallet can review funded finalization and a rejected signature does not repeat', async ({page}) => {
  const executor='0x'+'88'.repeat(20);
  await prepare(page);await rpc(page,4);await installRejectingWallet(page,executor);await page.clock.resume();
  await page.goto(`${urls.web}/claims`);
  const action=page.getByRole('button',{name:'Finalize draw & collect reward',exact:true});
  await expect(action).toBeDisabled();
  await connectWebWallet(page, executor);
  await expect(action).toBeEnabled(); await action.click();
  await expect(page.getByRole('alertdialog')).toContainText('0.01 ETH');
  await page.getByRole('button',{name:'Continue to wallet'}).click();
  await expect(page.getByText('The wallet request was declined. Nothing else will be sent automatically.')).toBeVisible();
  const sent=await page.evaluate(()=>(window as any).__v12Submissions);
  expect(sent).toHaveLength(1);
  const call=new Interface(ra).parseTransaction(sent[0][0]);
  expect(call?.name).toBe('finalizeDrawAndClaim');expect(call?.args[0].toLowerCase()).toBe(executor);
  expect(BigInt(sent[0][0].value)).toBe(0n);
});
