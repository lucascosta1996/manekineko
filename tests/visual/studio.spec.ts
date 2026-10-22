import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';
for (const [width, height] of widths) {
 test(`Tincta parent page ${width}`, async ({page,browserName},info) => {
  test.skip(browserName !== 'chromium' && ![390,1440].includes(width));
  await page.setViewportSize({width,height});await prepare(page);await page.goto(urls.landing);await ready(page);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Defined 100% onchain. Shaped by participation.');
  await expect(page.locator('.studio-header .ui-rewards-label')).toHaveCount(0);
  await expect(page.locator('.studio-hero [data-tincta-artwork="open"]')).toHaveCount(0);
  await expect(page.locator('.studio-feature [data-tincta-artwork="open"]')).toHaveCount(1);
  await expect(page.getByText('Research concept',{exact:true})).toHaveCount(2);
  await expect(page.locator('.collection-announcement')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`studio-${width}.png`),fullPage:true});
  await page.clock.resume();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 });
}
test('parent links, keyboard research disclosures, and Rewards round trip',async({page})=>{
 await prepare(page);await page.goto(urls.landing);await ready(page);
 await page.getByRole('link',{name:'Explore our projects',exact:true}).click();await expect(page).toHaveURL(/#projects$/);
 const question=page.getByText('The research question',{exact:true}).first();await question.focus();await page.keyboard.press('Enter');
 await expect(page.locator('details').first()).toHaveAttribute('open','');
 await expect(page.getByText(/How can ownership patterns/)).toBeVisible();
 await page.keyboard.press('Enter');await expect(page.locator('details').first()).not.toHaveAttribute('open','');
 await page.getByRole('link',{name:'Explore Tincta Rewards',exact:true}).click();await expect(page).toHaveURL(/\/rewards$/);await ready(page);
 await expect(page.getByRole('link',{name:'Tincta Rewards home'})).toBeVisible();
 await expect(page.locator('.collection-announcement')).toBeVisible();
 await page.getByRole('link',{name:'Website',exact:false}).click();await expect(page).toHaveURL(urls.landing+'/');
});
test('parent breakpoints, enlarged text, reduced motion, and high contrast',async({page})=>{
 await prepare(page);await page.goto(urls.landing);await ready(page);
 for(const width of [320,599,600,601,759,760,761,959,960,961,1440]) {
  await page.setViewportSize({width,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`).toBe(true);
 }
 await page.setViewportSize({width:320,height:800});await page.addStyleTag({content:'html{font-size:200%}'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'200% text reflow').toBe(true);
 await page.addStyleTag({content:':where(p,span,a,summary){line-height:1.5;letter-spacing:.12em;word-spacing:.16em}p{margin-block-end:2em}'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'text spacing reflow').toBe(true);
 await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
 await expect(page.locator('html')).toHaveCSS('scroll-behavior','auto');
 await expect(page.getByRole('link',{name:'Explore our projects',exact:true})).toBeVisible();
});
