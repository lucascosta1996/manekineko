import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {prepare,ready,urls} from './fixtures';
import {mirrorFixtureGallery} from '../../apps/web/test/nft-mirror-visual-data';
import type {WalletProfile} from '../../apps/web/lib/wallet-profile/model';
test.beforeEach(async({page})=>{
  await page.route('https://api.web3modal.org/appkit/v1/**',route=>route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'*'},json:{features:[],planLimits:{tier:'starter',isAboveMauLimit:false,isAboveRpcLimit:false}}}));
});
const address='0x'+'2'.repeat(40);
const profile:WalletProfile={status:'ready',wallet:address,chainId:11155111,contract:'0x'+'1'.repeat(40),block:12020301,syncedAt:'2026-10-29T15:10:00.000Z',catchingUp:false,stale:false,totals:[{kind:0,count:3,amountWei:'600000000000000'},{kind:2,count:1,amountWei:'133333333333333'},{kind:1,count:1,amountWei:'100000000000000'}],owned:1,nftPage:1,activityPage:1,paymentsTotal:5,nfts:[{tokenId:262159,collectionId:2,serial:15,name:'Aster Beacon #15',collectionName:'Aster Beacon',numbers:[1,2,3,4],image:mirrorFixtureGallery(1,'loaded').tokens[0].image}],payments:[0,0,0,2,1].map((kind,index)=>({transaction:'0x'+['a','b','c','d','e'][index].repeat(64),logIndex:1,block:12020301-index,collectionId:kind===1?1:2,collectionName:kind===1?'Aster Atlas':'Aster Beacon',tokenId:kind===2?0:kind===1?131073:262159-index,kind,amountWei:kind===2?'133333333333333':kind===1?'100000000000000':'200000000000000'}))};
for(const width of [390,1101,1440])test(`Wallet receipts and global NFT identifiers at ${width}`,async({page})=>{
  await prepare(page);await page.clock.resume();await page.setViewportSize({width,height:900});
  await page.route('**/api/wallet?**',route=>route.fulfill({json:profile}));
  await page.goto(urls.web+'/wallet');await ready(page);
  await expect(page.locator('.wallet-total')).toHaveText('0.000733333333333333 ETH');
  await expect(page.locator('.wallet-stats')).toContainText('3 prizes received');
  await expect(page.locator('.wallet-stats')).toContainText('0.0001 ETH');
  await expect(page.locator('.wallet-artwork')).toHaveAttribute('href',/instance\/262159$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/wallet-${width}.png`});
});
test('Wallet loading, failure, retry, account changes and unavailable data do not fabricate zero totals',async({page})=>{
  await prepare(page);await page.clock.resume();let state='held',release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/wallet?**',async route=>{
    if(state==='held')await held;
    if(state==='failure')return route.fulfill({status:503,json:{error:'Unavailable'}});
    const wallet=new URL(route.request().url()).searchParams.get('address')!;
    return route.fulfill({json:{...profile,wallet,status:state==='unavailable'?'unavailable':state==='syncing'?'syncing':'ready',...(wallet===address?{}:{totals:[],nfts:[],owned:0,payments:[],paymentsTotal:0})}});
  });
  await page.goto(urls.web+'/wallet');
  await expect(page.getByRole('status')).toContainText('Loading your wallet activity');
  await expect(page.locator('.wallet-total')).toHaveCount(0);
  state='failure';release();await expect(page.locator('.wallet-page').getByRole('alert')).toContainText('couldn’t update');
  state='ready';await page.getByRole('button',{name:'Refresh activity'}).click();await expect(page.locator('.wallet-total')).toHaveText('0.000733333333333333 ETH');
  state='syncing';await page.getByRole('button',{name:'Use another fixture wallet'}).click();await expect(page.locator('.wallet-total')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Your wallet activity is syncing.'})).toBeVisible();
  state='unavailable';await page.getByRole('button',{name:'Refresh activity'}).click();await expect(page.locator('.wallet-total')).toHaveCount(0);
  state='ready';await page.getByRole('button',{name:'Refresh activity'}).click();await expect(page.locator('.wallet-total')).toHaveText('0.0 ETH');
  await page.getByRole('button',{name:'Disconnect fixture wallet'}).click();await expect(page.getByRole('heading',{name:'Connect your wallet',exact:true})).toBeVisible();await expect(page.locator('.wallet-total')).toHaveCount(0);
});
