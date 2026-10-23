import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import { docPages } from '../../apps/web/lib/docs/content';
for (const width of [390,1440]) for (const guide of docPages) test(`Current guide ${guide.slug} ${width}`,async({page})=>{
 await prepare(page);await page.setViewportSize({width,height:900});await page.goto(`${urls.web}/docs${guide.slug==='overview'?'':'/'+guide.slug}`);await ready(page);await page.clock.resume();
 await expect(page.getByRole('heading',{level:1,name:guide.title})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
});
test('Current guides search voting economics locally and keep keyboard focus',async({page})=>{
 await prepare(page);await page.goto(`${urls.web}/docs`);await ready(page);await page.clock.resume();
 const search=page.getByRole('searchbox',{name:'Search reward guides'});await search.fill('voting');await expect(page.locator('.docs-search-results a').first()).toBeVisible();
 await search.fill('zzzz-not-a-guide');await expect(page.getByText('No matching pages.')).toBeVisible();
 await search.press('Escape');await expect(search).toHaveValue('');await expect(search).toBeFocused();
});
