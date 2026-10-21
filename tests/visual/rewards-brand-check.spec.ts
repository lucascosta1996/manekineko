import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
for (const [app, routes] of Object.entries({landing:['/rewards'],web:['/docs','/my-nfts'],launch:['/login','/dashboard','/loading','/error','/not-found']})) {
 for(const width of [320,390,768,1440]) for(const route of routes) {
  test(`${app} ${route} ${width}`,async({page})=>{
   await page.setViewportSize({width,height:900});await prepare(page);await page.goto(urls[app as keyof typeof urls]+route);await ready(page);
   if(app==='launch'&&route==='/dashboard'&&width<1024) await page.getByRole('button',{name:"Open navigation"}).first().click();
   const brands=page.locator('.ui-rewards-brand:visible');expect(await brands.count()).toBeGreaterThan(0);
   for(const brand of await brands.all()) {
    await expect(brand.locator('.ui-rewards-label')).toHaveText('Rewards');
    const metrics=await brand.evaluate(el=>{const box=el.getBoundingClientRect(),s=getComputedStyle(el.querySelector('.ui-rewards-label')!);return {left:box.left,right:box.right,gap:getComputedStyle(el).gap,size:s.fontSize,radius:s.borderRadius};});
    expect(metrics.left).toBeGreaterThanOrEqual(0);expect(metrics.right).toBeLessThanOrEqual(width);expect(metrics.gap).toBe('14px');expect(metrics.size).toBe('13px');expect(metrics.radius).toBe('3px');
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
   await brands.first().screenshot({path:`test-results/rewards-lockup-${app}-${route.replaceAll('/','')}-${width}.png`});
   await page.screenshot({path:`test-results/rewards-${app}-${route.replaceAll('/','')}-${width}.png`,fullPage:true});
   await page.clock.resume();const a=await new AxeBuilder({page}).include('.ui-rewards-brand').analyze();expect(a.violations).toEqual([]);
  });
 }
}
