import {test, expect} from '@playwright/test';
import {prepare,ready,urls,collection} from './fixtures';
for (const width of [390,1440]) test(`web / V11 full pool terms at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await prepare(page,'v11');
 await page.goto(`${collection.href}/affiliates?state=v11`);await ready(page);
 await page.getByText('Program terms',{exact:true}).click();
 await expect(page.getByText(/At sellout, the full affiliate budget is shared equally/).first()).toBeVisible();
 await expect(page.getByText(/The shared payout limit is/)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.affiliate-program-terms').first().scrollIntoViewIfNeeded();
 await page.screenshot({path:`output/v11-affiliate-${width}.png`,fullPage:true});
});
