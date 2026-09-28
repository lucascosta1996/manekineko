import { test, expect } from '@playwright/test';
import { prepare, urls } from './fixtures';

test('fixture boundary blocks non-API writes and unapproved origins', async ({ page }) => {
 await prepare(page); await page.goto(urls.landing);
 const writes = await page.evaluate(async () => {
  const outcomes = [];
  for (const path of ['/api/newsletter', '/server-action']) {
   const response = await fetch(path, {method:'POST', body:'fixture-only'});
   outcomes.push([response.status, (await response.json()).error]);
  }
  return outcomes;
 });
 expect(writes).toEqual([[409,'Visual fixture: write intercepted.'],[409,'Visual fixture: write intercepted.']]);
 for (const target of ['https://fixture-external.invalid/', 'http://127.0.0.1:4999/']) {
  expect(await page.evaluate(url => fetch(url).then(() => false, () => true), target)).toBe(true);
 }
 // Context routing also protects windows opened by links/components.
 const popup = await page.context().newPage();
 const error = await popup.goto('https://fixture-external.invalid/').then(() => null, error => error.message);
 expect(error).toBeTruthy(); await popup.close();
});
