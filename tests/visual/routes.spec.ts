import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';
import { docPages } from '../../apps/web/lib/docs/content';
import { visualCollection } from '../../apps/web/test/visual-data';
// Each route owns a fresh context and unique reference file; share the three
// worker slots across this matrix instead of serializing each engine's routes.
test.describe.configure({ mode: 'parallel' });
const web = ['/seasons', `/seasons/11155111/${visualCollection.seasonId}`, `/mint/${visualCollection.id}`, `/mint/${visualCollection.id}/affiliates`, `/mint/${visualCollection.id}/contract`, '/history','/my-nfts',`/nfts/${visualCollection.id}/1`,'/prizes','/docs',...docPages.filter(p=>p.slug!=='overview').map(p=>`/docs/${p.slug}`),'/visual/loading','/visual/error','/visual/not-found', '/visual/docs/loading', '/visual/docs/error', '/visual/docs/not-found', '/visual/mint/error', '/visual/mint/not-found', '/visual/seasons/error', '/visual/seasons/not-found', '/visual/history/error', '/visual/nft/error', '/visual/nft/not-found'];
const launch = ['/login','/dashboard','/activity','/settings','/seasons','/launch','/active-collection','/upcoming-collection','/earnings','/error','/loading','/not-found'];
for (const [app, routes] of Object.entries({ landing: ['/', '/visual/error', '/visual/not-found'], web, launch })) {
 for (const route of routes) {
  for (const [width,height] of widths) {
   test(`${app} ${route} ${width}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium' && ![390,1440].includes(width), 'Primary-engine full viewport matrix; other engines critical phone/desktop.');
    await page.setViewportSize({width,height}); await prepare(page);
    await page.goto(urls[app as keyof typeof urls]+route); await ready(page);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    expect(overflow,'No page-level horizontal overflow').toBe(false);
    expect(await page.locator('h1').count(),'One main heading').toBe(1);
    await expect(page).toHaveScreenshot(`${app}-${route.replace(/\W+/g,'-')}-${width}.png`,{fullPage:true});
    // Capture while deterministic timers are paused; axe requires running timers.
    await page.clock.resume();
    const analysis=await new AxeBuilder({page}).analyze();
    expect(analysis.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),'Accessibility violations').toEqual([]);
   });
  }
 }
}
