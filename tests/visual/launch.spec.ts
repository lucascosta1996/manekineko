import { expect, test } from '@playwright/test';
import { prepare, ready, urls } from './fixtures';
import { launchFixtureResponse } from '../../apps/launch/test/visual-data';

test('Launch login validates inline, holds its action geometry and retains input after failure', async ({ page }) => {
 await prepare(page);
 let writes = 0;
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 await page.route('**/api/launch/auth/login', async route => {
  writes++;
  await gate;
  await route.fulfill({ status: 401, json: { message: 'Sign-in failed. Check your credentials and try again.' } });
 });
 await page.goto(`${urls.launch}/login`);
 await ready(page);
 const action = page.getByRole('button', { name: 'Sign in', exact: true });
 await action.click();
 await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toHaveText('Enter your username.');
 await expect(page.getByRole('textbox', { name: 'Username' })).toBeFocused();
 expect(writes).toBe(0);
 await expect(page).toHaveScreenshot('launch-login-invalid.png', { fullPage: true });
 await page.getByRole('textbox', { name: 'Username' }).fill('visual.operator');
 await page.getByLabel('Password', { exact: true }).fill('fixture-only');
 const initial = await action.boundingBox();
 await action.click();
 const pending = page.getByRole('button', { name: 'Signing in…', exact: true });
 await expect(pending).toHaveAttribute('aria-busy', 'true');
 const held = await pending.boundingBox();
 expect(Math.abs(initial!.width - held!.width)).toBeLessThanOrEqual(1);
 expect(Math.abs(initial!.height - held!.height)).toBeLessThanOrEqual(1);
 await pending.evaluate((element: HTMLButtonElement) => element.click());
 expect(writes).toBe(1);
 await expect(page).toHaveScreenshot('launch-login-pending.png', { fullPage: true });
 release();
 await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toHaveText('Sign-in failed. Check your credentials and try again.');
 await expect(page.getByLabel('Username', { exact: true })).toHaveValue('visual.operator');
 await expect(page.getByLabel('Password', { exact: true })).toHaveValue('fixture-only');
 await expect(page).toHaveScreenshot('launch-login-server-error.png', { fullPage: true });
});

test('Launch draft confirmation preserves cancellation and guards the intercepted sign-out action', async ({ page }) => {
 await prepare(page);
 let writes = 0;
 await page.route('**/api/launch/auth/logout', async route => {
  writes++;
  await route.fulfill({ status: 409, json: { message: 'Visual fixture: sign-out intercepted.' } });
 });
 await page.goto(`${urls.launch}/launch`);
 await expect(page.getByLabel('Configuration name', { exact: false })).toHaveValue('Visual study — Lilac');
 const name = page.getByLabel('Configuration name', { exact: false });
 await name.fill('Preserve my unsaved collection');
 await page.getByRole('button', { name: 'New collection' }).click();
 const dialog = page.getByRole('alertdialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
 await expect(page).toHaveScreenshot('launch-discard-confirmation.png');
 await dialog.getByRole('button', { name: 'Keep editing' }).click();
 await page.clock.runFor(50);
 await expect(name).toHaveValue('Preserve my unsaved collection');
 await expect(page.getByRole('button', { name: 'New collection' })).toBeFocused();
 await page.getByRole('button', { name: 'Sign out' }).click();
 await expect(dialog).toContainText('Leave this workspace and discard your unsaved changes?');
 await page.keyboard.press('Escape');
 await page.clock.runFor(50);
 expect(writes).toBe(0);
 await expect(name).toHaveValue('Preserve my unsaved collection');
 await page.getByRole('button', { name: 'Sign out' }).click();
 await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
 await expect.poll(() => writes).toBe(1);
 await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toContainText('Visual fixture: sign-out intercepted.');
 await expect(name).toHaveValue('Preserve my unsaved collection');
});

test('Launch holds initial reads without recovery actions, then exposes confirmed data', async ({ page }) => {
 await prepare(page);
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 await page.route('**/api/launch/collections/operations?*', async route => {
  await gate;
  const fixture = launchFixtureResponse(route.request().url());
  await route.fulfill({ status: fixture.status, json: fixture.body });
 });
 await page.goto(`${urls.launch}/dashboard`);
 await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
 await page.clock.runFor(3000);
 await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
 release();
 await expect(page.getByRole('heading', { name: 'Lilac', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
});

for (const state of ['empty', 'error']) test(`Launch ${state} has explicit feedback and a styled recovery`, async ({ page }) => {
 await prepare(page, state);
 await page.goto(`${urls.launch}/active-collection`);
 await ready(page);
 if (state === 'empty') await expect(page.getByText('No deployed collection in these runs.', { exact: false })).toBeVisible();
 else await expect(page.locator('[role=alert]:not(#__next-route-announcer__)')).toBeVisible();
 const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
 await expect(refresh).toHaveClass(/ui-button-secondary/);
 await page.route('**/api/launch/collections/operations?*', async route => {
  const fixture = launchFixtureResponse(route.request().url());
  await route.fulfill({ status: fixture.status, json: fixture.body });
 });
 await refresh.click();
 await expect(page.getByRole('heading', { name: 'Lilac', exact: true })).toBeVisible();
});

test('Launch mobile drawer traps focus and restores its trigger on Escape', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 568 });
 await prepare(page);
 await page.goto(`${urls.launch}/dashboard`);
 await ready(page);
 const menu = page.getByRole('button', { name: 'Open navigation' });
 await menu.click();
 const drawer = page.getByRole('dialog', { name: 'Launch navigation' });
 await expect(drawer).toBeVisible();
 await expect(page).toHaveScreenshot('launch-mobile-drawer.png');
 for (let step = 0; step < 14; step++) {
  await page.keyboard.press('Tab');
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
 }
 await page.keyboard.press('Escape');
 await page.clock.runFor(50);
 await expect(drawer).toHaveCount(0);
 await expect(menu).toBeFocused();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const width of [390, 1440]) test(`Launch editor tabs and disclosure controls at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 await prepare(page);
 await page.goto(`${urls.launch}/launch`);
 await ready(page);
 const tabs = ['Collection', 'Prizes & affiliates', 'Operations', 'Review'];
 for (const label of tabs) {
  await page.locator('.launch-tabs button').filter({ hasText: label }).click();
  // Expand the real fields and instructions, including nested disclosures.
  const summaries = page.locator('.launch-editor details.ui-disclosure > summary');
  for (let index = 0; index < await summaries.count(); index++) {
   const summary = summaries.nth(index);
   if (!await summary.isVisible()) continue;
   const metrics = await summary.evaluate(el => {
    const style = getComputedStyle(el);
    return { minHeight: parseFloat(style.minHeight), marker: style.listStyleType, size: style.fontSize };
   });
   expect(metrics.minHeight).toBeGreaterThanOrEqual(40);
   expect(metrics.marker).toBe('none');
   expect(metrics.size).toBe('15px');
   if (!await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)) {
    await summary.focus();
    await page.keyboard.press('Enter');
    expect(await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)).toBe(true);
    await page.keyboard.press('Space');
    expect(await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)).toBe(false);
    await page.keyboard.press('Enter');
   }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(`launch-editor-${label.toLowerCase().replaceAll(/[^a-z]+/g, '-')}-${width}.png`, { fullPage: true });
 }
 await page.clock.resume();
 const { default: AxeBuilder } = await import('@axe-core/playwright');
 for (const label of tabs) {
  await page.locator('.launch-tabs button').filter({ hasText: label }).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations, label).toEqual([]);
 }
});

for (const width of [390, 1440]) test(`Launch season configuration and review at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 await prepare(page);
 await page.goto(`${urls.launch}/seasons`);
 await ready(page);
 const summaries = page.locator('details.ui-disclosure > summary');
 for (let index = 0; index < await summaries.count(); index++) {
  const summary = summaries.nth(index);
  if (!await summary.isVisible()) continue;
  expect(await summary.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(40);
  if (!await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)) await summary.click();
 }
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
 await expect(page.locator('.automation-plan-settings').first()).toHaveScreenshot(`launch-season-settings-${width}.png`);
 await expect(page.locator('.automation-plan-settings').last()).toHaveScreenshot(`launch-season-cadence-${width}.png`);
 await expect(page.locator('.automation-editor')).toHaveScreenshot(`launch-season-collection-${width}.png`);
 await page.clock.resume();
 const { default: AxeBuilder } = await import('@axe-core/playwright');
 expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 await page.getByRole('complementary', { name: 'Collection launch order' }).getByRole('button', { name: 'Review sequence' }).click();
 await expect(page.getByRole('region', { name: 'Season review' })).toBeVisible();
 await expect(page.locator('.automation-editor')).toHaveScreenshot(`launch-season-review-${width}.png`);
 expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
