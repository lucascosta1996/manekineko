import { Interface } from 'ethers';
import roundAbi from '../../packages/contracts/src/ManekinekoRoundV12.json';
import controllerAbi from '../../packages/contracts/src/ManekinekoSeasonControllerV12.json';
import { visualNow } from '../../apps/web/test/visual-data';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import { rpc, A, C, T, installRejectingWallet } from './v12-rpc';
for (const width of [320,390,768,1280,1440]) {
  test(`Launch pending signatures and progress tree ${width}`, async ({page}) => {
    await page.setViewportSize({width,height:1000}); await prepare(page); await rpc(page,7); await page.clock.resume();
    await page.goto(`${urls.launch}/dashboard`);
    // The initial dashboard performs the complete pinned contract read in the hosted fixture.
    await expect(page.getByRole('heading',{name:'Actions to review'})).toBeVisible({timeout:30_000});
    await expect(page.getByRole('heading',{name:'Fictional voting study'})).toBeVisible();
    await ready(page);
    await expect(page.getByRole('heading',{name:'Prepare the next collection',exact:true})).toBeVisible();
    await expect(page.getByText('Refunds available',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Review transaction'}).first()).toBeDisabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include('.operator-shell').analyze()).violations).toEqual([]);
    await page.getByLabel('Search seasons and collections').fill('missing season');
    await expect(page.getByText('No seasons match your search.')).toBeVisible();
    await page.getByLabel('Search seasons and collections').fill('');
    await page.screenshot({path:`test-results/v12-launch-${width}.png`,fullPage:true});
  });
}
test('Launch planned catalog never invents deployed state or wallet approvals', async ({page}) => {
  await prepare(page); await page.goto(`${urls.launch}/dashboard?state=unconfigured`); await ready(page);
  await expect(page.getByText('22 seasons',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Deployment not connected'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect wallet',exact:true})).toHaveCount(0);
  await expect(page.getByText('Not deployed',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Aster Study',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'Ethereum Mainnet',exact:true}).click();
  // Changing network cannot carry an old wallet session or signing intent into a new instance.
  await expect(page.getByRole('link',{name:'Ethereum Mainnet',exact:true})).toHaveAttribute('aria-current','page');
  await page.goto(`${urls.launch}/dashboard?chainId=1&state=unconfigured`);
  await expect(page.getByRole('heading',{name:'Mainnet deployment not connected.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'View Sepolia status'})).toHaveAttribute('href','/dashboard?chainId=11155111');
});
test('Launch invalid pins disable signing and recover on retry', async ({page}) => {
  await prepare(page); await rpc(page,7,true); await page.clock.resume(); await page.goto(`${urls.launch}/dashboard`);
  await expect(page.locator('.protocol-panel[role=alert]')).toContainText('deployment could not be verified');
  await expect(page.getByRole('button',{name:'Review transaction'})).toHaveCount(0);
  await rpc(page,7,false); await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.getByRole('heading',{name:'Actions to review'})).toBeVisible();
});
test('Launch restores an unknown submission and rejects a wrong recovery hash', async ({page}) => {
  await prepare(page); await rpc(page,7); await page.clock.resume();
  await page.addInitScript(({A,C,T})=>{
    const provider={on:()=>{},removeListener:()=>{},request:async(q:{method:string;params?:unknown[]})=>{
      if(['eth_accounts','eth_requestAccounts'].includes(q.method))return[A];
      if(q.method==='eth_chainId')return'0xaa36a7';
      return (await (await fetch('https://v12.fixture.invalid/',{method:'POST',body:JSON.stringify({...q,id:1,jsonrpc:'2.0'}),headers:{'content-type':'application/json'}})).json()).result;
    }};
    Object.assign(window,{ethereum:provider});
    localStorage.setItem(`tincta:v12:11155111:${C}:${A}`,JSON.stringify({label:'Prepare next collection',to:C,data:'0x1234',value:'0',nonce:3,chainId:11155111,wallet:A}));
  },{A,C,T});
  await page.goto(`${urls.launch}/dashboard`);
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('button',{name:'Browser wallet',exact:true}).click();
  await page.getByRole('button',{name:`Use account ${A}`}).click();
  await expect(page.getByRole('heading',{name:'Check transaction status'})).toBeVisible();
  await page.getByText('Find a sent transaction',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Review transaction'}).first()).toBeDisabled();
  await page.getByLabel('Transaction hash',{exact:true}).fill('0x'+'99'.repeat(32));
  await page.getByRole('button',{name:'Find receipt'}).click();
  await expect(page.getByText('This hash does not match the pending action.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Review transaction'}).first()).toBeDisabled();
});

test('Launch reviews exact operator proceeds and a rejection never resubmits', async ({page}) => {
  await prepare(page); await rpc(page,5); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('button',{name:'V12 fixture wallet',exact:true}).click();
  await page.getByRole('button',{name:`Use account ${A}`}).click();
  await page.getByText(/^Individual actions & fund recovery/).click();
  const action=page.locator('.operator-action-list > li').filter({has:page.getByRole('heading',{name:'Withdraw protocol treasury',exact:true})});
  await expect(action.getByRole('button',{name:'Review transaction'})).toBeEnabled();
  await action.getByRole('button',{name:'Review transaction'}).click();
  await expect(page.getByRole('alertdialog')).toContainText('Send 2.0 ETH to the fixed operator wallet');
  await expect(page.getByRole('alertdialog')).toContainText(T);
  expect(await page.evaluate(()=>(window as any).__v12Submissions.length)).toBe(0);
  await page.getByRole('button',{name:'Continue to wallet'}).click();
  await expect(page.getByText('The wallet request was declined. Nothing else will be sent automatically.')).toBeVisible();
  const submissions=await page.evaluate(()=>(window as any).__v12Submissions);
  expect(submissions).toHaveLength(1);
  const call=new Interface(roundAbi).parseTransaction(submissions[0][0]);
  expect(call?.name).toBe('withdrawOperator');expect(call?.args[0].toLowerCase()).toBe(A);expect(call?.args[1]).toBe(2n*10n**18n);
});
test('Launch denies operator withdrawal controls to another wallet', async ({page})=>{
  await prepare(page);await rpc(page,5);const other='0x'+'88'.repeat(20);await installRejectingWallet(page,other);await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'V12 fixture wallet',exact:true}).click();await page.getByRole('button',{name:`Use account ${other}`}).click();
  const action=page.locator('.operator-action-list > li').filter({has:page.getByRole('heading',{name:'Settle & prepare next collection',exact:true})});
  await expect(action.getByRole('button',{name:'Review transaction'})).toBeDisabled();
});
test('Launch combines settlement, payout and preparation in one reviewed wallet transaction including exact funding', async ({page}) => {
  await prepare(page); await rpc(page,4,false,{deadline:Math.floor(Date.parse(visualNow)/1000)-60,operatingBalance:'0'}); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);
  await expect(page.getByText('Fictional voting study · Time since sellout',{exact:true})).toBeVisible();
  await expect(page.getByText(/Randomness recorded — refunds unavailable\./)).toBeVisible();
  await expect(page.getByText(/Mint deadline in/)).toHaveCount(0);
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('button',{name:'V12 fixture wallet',exact:true}).click();
  await page.getByRole('button',{name:`Use account ${A}`}).click();
  const action=page.locator('.operator-action-list > li').filter({has:page.getByRole('heading',{name:'Settle & prepare next collection',exact:true})});
  await action.getByRole('button',{name:'Review transaction'}).click();
  const dialog=page.getByRole('alertdialog');
  await expect(dialog).toContainText('2.0 ETH'); await expect(dialog).toContainText('0.04 ETH');
  await expect(dialog).toContainText('Prepare collection 3'); await expect(dialog).toContainText(C);
  expect(await page.evaluate(()=>(window as any).__v12Submissions.length)).toBe(0);
  await page.getByRole('button',{name:'Continue to wallet'}).click();
  await expect(page.getByText('The wallet request was declined. Nothing else will be sent automatically.')).toBeVisible();
  const submissions=await page.evaluate(()=>(window as any).__v12Submissions);
  expect(submissions).toHaveLength(1);
  const tx=submissions[0][0], call=new Interface(controllerAbi).parseTransaction(tx);
  expect(tx.to.toLowerCase()).toBe(C);expect(BigInt(tx.value)).toBe(4n*10n**16n);
  expect(call?.name).toBe('settleAndPrepare');expect(call?.args[0]).toBe(2n);expect(call?.args[1]).toBe(2n*10n**18n);
});
for (const width of [390,1440]) test(`Launch settlement and sellout timer layout ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await prepare(page);await rpc(page,4);await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);await ready(page);
  await expect(page.getByRole('heading',{name:'Settle & prepare next collection',exact:true})).toBeVisible();
  await expect(page.getByText(/Randomness recorded — refunds unavailable\./)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).include('.operator-shell').analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/v12-settlement-${width}.png`,fullPage:true});
});
test('Launch countdown reaches zero without inventing refunds from a cached live phase',async({page})=>{
  await prepare(page); await rpc(page,1,false,{deadline:Math.floor(Date.parse(visualNow)/1000)+30}); await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);
  await expect(page.getByText('Fictional voting study · Mint deadline in',{exact:true})).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/00:00:(2[0-9]|30)/);
  await page.clock.runFor(31000);
  await expect(page.getByRole('timer')).toHaveText('00:00:00');
  await expect(page.getByText(/Mint deadline reached\. Checking whether/)).toBeVisible();
  await expect(page.getByText('Refunds available',{exact:true})).toHaveCount(0);
  await rpc(page,7);await page.clock.runFor(12000);
  await expect(page.getByText('Fictional voting study · Refunds available',{exact:true})).toBeVisible();
  await expect(page.locator('.operator-timing').getByText('No expiration',{exact:true})).toBeVisible();
  await expect(page.locator('.operator-timing').getByRole('timer')).toHaveCount(0);
});
test('Launch shows progress fallback and disables stale timing',async({page})=>{
  await prepare(page);await rpc(page,4,false,{canFinalize:false});await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);
  await expect(page.getByRole('heading',{name:'Advance draw processing',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Settle & prepare next collection',exact:true})).toHaveCount(0);
  await page.route('https://v12.fixture.invalid/**',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.clock.runFor(13000);
  await expect(page.getByText('Fictional voting study · Timing unavailable',{exact:true})).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('—');
});
test('Launch reviews draw funding as exact ETH and sends only the reviewed call', async ({page}) => {
  await prepare(page); await rpc(page,2); await installRejectingWallet(page); await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`);
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('button',{name:'V12 fixture wallet',exact:true}).click();
  await page.getByRole('button',{name:`Use account ${A}`}).click();
  await page.getByText('Add draw funding',{exact:true}).click();
  await page.getByLabel('Additional funding (ETH)').fill('0.025');
  await page.getByRole('button',{name:'Review draw funding',exact:true}).click();
  await expect(page.getByRole('alertdialog')).toContainText('Send 0.025 ETH');
  expect(await page.evaluate(()=>(window as any).__v12Submissions.length)).toBe(0);
  await page.getByRole('button',{name:'Continue to wallet'}).click();
  await expect(page.getByText('The wallet request was declined. Nothing else will be sent automatically.')).toBeVisible();
  const submissions=await page.evaluate(()=>(window as any).__v12Submissions);
  expect(submissions).toHaveLength(1);
  expect(BigInt(submissions[0][0].value)).toBe(25n*10n**15n);
  expect(new Interface(roundAbi).parseTransaction(submissions[0][0])?.name).toBe('fundRandomness');
});
for (const width of [390,1440]) test(`Launch randomness deadline and timeout refund layout ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:1000}); await prepare(page);
  await rpc(page,3,false,{randomnessDeadline:Math.floor(Date.parse(visualNow)/1000)+30}); await page.clock.resume();
  await page.goto(`${urls.launch}/dashboard`); await ready(page);
  await expect(page.getByText('Fictional voting study · Randomness deadline in',{exact:true})).toBeVisible();
  await expect(page.getByText(/Executor reward: 0.01 ETH/)).toBeVisible();
  await expect(page.getByText(/full mint-price refunds become available/)).toBeVisible();
  expect((await new AxeBuilder({page}).include('.operator-shell').analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/v12-randomness-deadline-${width}.png`,fullPage:true});
  await page.clock.runFor(31000);
  await expect(page.getByRole('timer')).toHaveText('00:00:00');
  await expect(page.getByText(/Checking the contract before showing refund availability/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Prepare the next collection',exact:true})).toHaveCount(0);
  await rpc(page,7,false,{drawTimeout:true}); await page.clock.runFor(12000);
  await expect(page.getByText(/No randomness was recorded before this collection’s onchain deadline/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Prepare the next collection',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/v12-draw-refunds-${width}.png`,fullPage:true});
});
test('Launch offers mobile wallet connections and closes the selector without signing', async ({ page }) => {
  await prepare(page); await rpc(page, 1); await page.clock.resume();
  await page.route('**/appkit/v1/config?*', route => route.fulfill({ json: { features: [] } }));
  await page.goto(urls.launch + '/dashboard');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'WalletConnect · mobile wallet', exact: true }).click();
  await expect(page.getByText('WalletConnect', { exact: true })).toBeVisible();
  await expect(page.getByText('Multi-Wallet Not Enabled', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'WalletConnect · mobile wallet', exact: true })).toBeEnabled();
  await expect(page.getByText('Wallet connection was canceled. Nothing was signed.', { exact: true })).toBeVisible();
});
