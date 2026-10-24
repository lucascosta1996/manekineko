import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';
import { docPages } from '../../apps/web/lib/docs/content';
for (const [width, height] of widths) for (const guide of docPages) test(`Current guide ${guide.slug} ${width}`,async({page},info)=>{
 test.skip(info.project.name !== "chromium" && ![390,1440].includes(width), "Primary engine covers all five sizes.");
 await prepare(page);await page.setViewportSize({width,height});await page.goto(`${urls.web}/docs${guide.slug==='overview'?'':'/'+guide.slug}`);await ready(page);await page.clock.resume();
 await expect(page.getByRole('heading',{level:1,name:guide.title})).toBeVisible();
 if (guide.slug === 'holder-rewards') {
  const examples = page.getByRole('region', {name: /^Different seasons, different amounts:/});
  if (await examples.evaluate(el => el.scrollWidth > el.clientWidth)) {
   await examples.focus();await page.keyboard.press('ArrowRight');
   await expect.poll(() => examples.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
   await examples.evaluate(el => { el.scrollLeft = 0; });
  }
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
 await page.screenshot({path:info.outputPath(`docs-${guide.slug}-${width}.png`),fullPage:true});
});
test('Current guides search voting economics locally and keep keyboard focus',async({page})=>{
 await prepare(page);await page.goto(`${urls.web}/docs`);await ready(page);await page.clock.resume();
 const search=page.getByRole('searchbox',{name:'Search reward guides'});await search.fill('voting');await expect(page.locator('.docs-search-results a').first()).toBeVisible();
 await search.fill('zzzz-not-a-guide');await expect(page.getByText('No matching pages.')).toBeVisible();
 await search.press('Escape');await expect(search).toHaveValue('');await expect(search).toBeFocused();
});
