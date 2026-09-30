import { expect, type Page } from '@playwright/test';
import { webVisualResponse, visualNow } from '../../apps/web/test/visual-data';
import { launchFixtureResponse } from '../../apps/launch/test/visual-data';
import seasonCatalog from '../../seasons.json';
export const browserErrors = new WeakMap<Page, string[]>();
export const urls = { landing: 'http://127.0.0.1:4311', web: 'http://127.0.0.1:4312', launch: 'http://127.0.0.1:4313' };
export const widths = [[320,800],[390,844],[768,1024],[1280,800],[1440,900]] as const;
export const collection = { name: 'Visual study', href: `${urls.web}/mint/11111111-1111-4111-8111-111111111111`, status: 'live', label: 'Mint open', target: '2026-09-29T00:00:00.000Z', updatedAt: visualNow, serverNow: visualNow, stale: false, chainTimestamp: visualNow, remainingSupply: 750, unpaidPrizes: 0, completedCollections: 0, totalCollections: 2, seasonColors: seasonCatalog[0].collections };
export async function prepare(page: Page, state = 'loaded') {
 const errors: string[] = []; browserErrors.set(page, errors);
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error' && /hydration|hydrating|did not match/i.test(message.text())) errors.push(message.text()); });
 await page.clock.install({ time: new Date(Date.parse(visualNow) - 60000) });
 await page.clock.pauseAt(new Date(visualNow));
 // Deny external requests, and never fall through a first-party API or mutation.
 await page.context().route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (!Object.values(urls).includes(url.origin)) return route.abort('blockedbyclient');
  if (!['GET','HEAD'].includes(request.method())) return route.fulfill({status:409,json:{error:'Visual fixture: write intercepted.'}});
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (url.port === '4313') { const response = launchFixtureResponse(request.url(), { method: request.method(), empty: state === 'empty' }); return route.fulfill({ status: state === 'error' ? 503 : response.status, json: response.body }); }
  if (request.method() !== 'GET') return route.fulfill({status:409,json:{error:'Visual fixture: write intercepted.'}});
  if (url.pathname === '/api/live-collection') return route.fulfill({ status: state === 'error' ? 503 : 200, json: { collection: state === 'empty' ? null : collection } });
  const body = webVisualResponse(request.url(), state);
  return route.fulfill({ status: state === 'error' ? 503 : body === null ? 404 : 200, json: body ?? {error:'No visual fixture for this request.'} });
 });
}
export async function ready(page: Page) {
 await page.locator('h1').first().waitFor();
 await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
 });
 // Wait for React's effects/fixture requests, without relying on networkidle polling.
 if (!new URL(page.url()).pathname.endsWith('/loading')) await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
 expect(browserErrors.get(page) ?? [], 'No page or hydration errors').toEqual([]);
}
export async function metrics(page: Page, selector: string) {
 return page.locator(selector).first().evaluate(element => {
  const s = getComputedStyle(element), box = element.getBoundingClientRect();
  const icon = element.querySelector('.ui-icon'); const i = icon && getComputedStyle(icon);
  return { font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,line:s.lineHeight,padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft],margin:[s.marginTop,s.marginRight,s.marginBottom,s.marginLeft],radius:s.borderRadius,border:s.borderTopWidth,gap:s.columnGap,minHeight:s.minHeight,height:box.height,width:box.width,icon:i&&[i.width,i.height,icon?.getAttribute('stroke-width')] };
 });
}
