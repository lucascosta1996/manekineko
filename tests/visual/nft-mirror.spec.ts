import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
const path='/collections/11155111/0x'+'2'.repeat(40);
test.beforeEach(async({page})=>{
  // The page uses the real global wallet provider; isolate its optional vendor
  // feature checks as well as the blockchain, including WebKit CORS failures.
  await page.route('https://api.web3modal.org/appkit/v1/**',route=>route.fulfill({
    headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'*'},
    json:{features:[],planLimits:{tier:'starter',isAboveMauLimit:false,isAboveRpcLimit:false}},
  }));
});

for (const width of [320,390,768,1440]) test(`NFT mirror artwork, links and layout at ${width}`,async({page},info)=>{
  test.skip(info.project.name!=='chromium' && ![390,1440].includes(width),'Primary engine covers intermediate widths.');
  await prepare(page); await page.clock.resume(); await page.setViewportSize({width,height:900});
  const rpcRequests: string[]=[];
  page.on('request',request=>{if(request.url().includes('v12.fixture') || request.url().includes('/api/nfts/')) rpcRequests.push(request.url());});
  await page.goto(urls.web+path); await ready(page);
  await expect(page.locator('.mirror-nft')).toHaveCount(24);
  expect(await page.locator('.mirror-nft img').first().evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth>0)).toBe(true);
  const artworkBox = (await page.locator('.mirror-nft img').first().boundingBox())!;
  expect(artworkBox.width/artworkBox.height).toBeCloseTo(4/5,2);
  await expect(page.locator('.mirror-numbers').first().locator('li')).toHaveCount(4);
  await expect(page.getByText('Refunded · Burned')).toBeVisible();
  await expect(page.locator('.mirror-links a').first()).toHaveAttribute('href',/eth-sepolia\.blockscout\.com\/token\/0x2{40}\/instance\/1$/);
  await expect(page.locator('main')).not.toContainText(/\bV\d+\b|Sepolia|testnet/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/nft-gallery-${width}-${info.project.name}.png`});
  await page.getByRole('link',{name:'Next',exact:true}).click(); await ready(page);
  await expect(page).toHaveURL(/page=2$/);
  await expect(page.locator('.mirror-nft h3').first()).toHaveText('NFT #25');
  await expect(page.locator('.mirror-nft')).toHaveCount(24);
  await page.getByRole('link',{name:'Next',exact:true}).click(); await ready(page);
  await expect(page.locator('.mirror-nft')).toHaveCount(1);
  await expect(page.locator('.mirror-nft h3').first()).toHaveText('NFT #49');
  await expect(page.getByRole('link',{name:'Next',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Previous',exact:true}).click(); await ready(page);
  await expect(page.locator('.mirror-nft h3').first()).toHaveText('NFT #25');
  expect(rpcRequests).toEqual([]);
  await page.addStyleTag({content:'html { font-size:200%; }'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('NFT mirror directory opens a collection',async({page})=>{
  await prepare(page); await page.clock.resume();
  await page.goto(urls.web+'/collections'); await ready(page);
  await expect(page.locator('.mirror-collection')).toHaveCount(3);
  await page.screenshot({path:'test-results/nft-collection-directory.png'});
  await page.getByRole('link',{name:/Color studies Crimson interval/}).click(); await ready(page);
  await expect(page.locator('.mirror-nft')).toHaveCount(24);
});
for (const state of ['syncing','backfill','empty','mainnet','error','not-found','loading']) test(`NFT mirror state: ${state}`,async({page})=>{
  await prepare(page); await page.clock.resume();
  const target=['error','not-found','loading'].includes(state) ? '/visual/collections/'+state : path+'?state='+state;
  await page.goto(urls.web+target); await ready(page);
  if (state==='syncing' || state==='backfill' || state==='empty') {
    await expect(page.getByText(state!=='empty' ? 'Artwork is syncing.' : 'No confirmed mints here yet.',{exact:true})).toBeVisible();
    await expect(page.locator('.mirror-nft')).toHaveCount(0);
  } else if (state==='mainnet') {
    await expect(page.locator('.mirror-links a').first()).toHaveAttribute('href',/opensea.io\/assets\/ethereum\/0x2{40}\/1$/);
  } else if (state==='error') {
    await expect(page.locator('main').getByRole('alert')).toContainText('couldn’t load');
    await page.getByRole('button',{name:'Try again'}).click(); await ready(page);
    await expect(page.locator('.mirror-collection')).toHaveCount(3);
  } else if (state==='not-found') {
    await expect(page.getByRole('link',{name:'All collections',exact:true})).toBeVisible();
  } else {
    await expect(page.getByRole('status')).toHaveText('Loading the gallery…');
    await expect(page.locator('.mirror-skeleton')).toHaveCount(8);
  }
});
