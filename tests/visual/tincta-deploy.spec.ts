import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';
import { visualNow } from '../../apps/web/test/visual-data';
import coordinator from '../../apps/launch/test/fixtures/mainnet-coordinator.json';
const A='0x1111111111111111111111111111111111111111',B='0x2222222222222222222222222222222222222222',H='0x'+'ab'.repeat(32);
async function install(page:Page,uncertain=false) {
 await page.addInitScript(({A,B,uncertain})=>{
  const writes:unknown[]=[];Object.assign(window,{deploymentWrites:writes});
  const p={on:()=>{},removeListener:()=>{},request:async(q:{method:string;params?:unknown[]})=>{
   if(['eth_accounts','eth_requestAccounts'].includes(q.method))return[A,B];
   if(q.method==='eth_chainId')return'0x1';
   if(q.method==='eth_sendTransaction'){writes.push(q.params);throw Object.assign(new Error(uncertain?'Connection lost':'Rejected'),{code:uncertain?-32603:4001});}
   throw new Error('Unexpected fixture wallet call: '+q.method);
  }};Object.assign(window,{ethereum:p});
 },{A,B,uncertain});
 await page.route(/https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)\/?/,async route=>{
  const raw=route.request().postDataJSON();const reply=(q:any)=>{
   let result:any;
   if(q.method==='eth_chainId')result='0x1';
   else if(q.method==='eth_getCode')result=coordinator.code;
   else if(q.method==='eth_call')result=coordinator.config;
   else if(q.method==='eth_getTransactionCount')result='0x7';
   else if(q.method==='eth_getBalance')result='0x56bc75e2d63100000';
   else if(q.method==='eth_estimateGas')result='0x8b7183';
   else if(['eth_gasPrice','eth_maxPriorityFeePerGas'].includes(q.method))result='0x3b9aca00';
   else if(q.method==='eth_getTransactionByHash'||q.method==='eth_getTransactionReceipt')result=null;
   else if(q.method==='eth_getBlockByNumber')result={number:q.params[0]==='latest'?'0x64':q.params[0],hash:H,parentHash:H,nonce:'0x0000000000000000',difficulty:'0x0',gasLimit:'0x3938700',gasUsed:'0x0',miner:A,extraData:'0x',timestamp:'0x'+Math.floor(Date.parse(visualNow)/1000).toString(16),transactions:[],baseFeePerGas:'0x3b9aca00'};
   else throw Error('Unmocked RPC: '+q.method);
   return {jsonrpc:'2.0',id:q.id,result};
  };await route.fulfill({json:Array.isArray(raw)?raw.map(reply):reply(raw),headers:{'access-control-allow-origin':'*'}});
 });
}
for(const width of [320,390,768,1440]) test(`Mainnet deployment review is readable without a connected wallet ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await prepare(page);await page.goto(`${urls.launch}/deploy`);await ready(page);
 await expect(page.getByRole('heading',{name:'Review. Connect. Deploy.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Choose wallet',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Approve Mainnet deployment',exact:true})).toHaveCount(0);
 await expect(page.getByRole('table')).toContainText('0.02 ETH');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).include('.operator-shell').analyze()).violations).toEqual([]);
 await page.screenshot({path:`test-results/tincta-deploy-${width}.png`,fullPage:true});
});
for(const uncertain of [false,true]) test(`deployment request ${uncertain?'survives a lost response and reload':'uses selected account and rejection is safe'}`,async({page})=>{
 test.setTimeout(90000);await prepare(page);await install(page,uncertain);await page.clock.resume();await page.goto(`${urls.launch}/deploy`);
 await page.getByRole('button',{name:'Choose wallet',exact:true}).click();await page.getByRole('button',{name:'Browser wallet',exact:true}).click();await page.getByRole('button',{name:`Use account ${B}`}).click();
 await page.getByRole('button',{name:'Check deployment and fees'}).click();
 await expect(page.getByRole('button',{name:'Approve Mainnet deployment',exact:true})).toBeEnabled({timeout:30000});
 expect(await page.evaluate(()=>(window as any).deploymentWrites)).toEqual([]);
 await page.getByRole('button',{name:'Approve Mainnet deployment',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toContainText(B);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>(window as any).deploymentWrites)).toEqual([]);
 await page.getByRole('button',{name:'Approve Mainnet deployment',exact:true}).click();await page.getByRole('button',{name:'Continue to wallet',exact:true}).click();
 await expect(page.getByLabel('Transaction updates')).toContainText(uncertain?'uncertain':'rejected in your wallet',{timeout:30000});
 const writes=await page.evaluate(()=>(window as any).deploymentWrites);expect(writes).toHaveLength(1);expect(writes[0][0].from).toBe(B);expect(writes[0][0].value).toBe('0x0');expect(writes[0][0].to).toBeUndefined();
 const saved=await page.evaluate(()=>localStorage.getItem('tincta-mainnet-deployment-1'));expect(Boolean(saved)).toBe(uncertain);
 await page.reload();await ready(page);
 if(uncertain){await expect(page.getByLabel('Deployment transaction hash')).toBeVisible();await expect(page.getByRole('button',{name:'Choose wallet',exact:true})).toHaveCount(0);}
 else await expect(page.getByRole('button',{name:'Choose wallet',exact:true})).toBeEnabled();
});
test('configured production contract prevents duplicate deployment',async({page})=>{
 await prepare(page);await page.goto(`${urls.launch}/deploy?state=configured`);await ready(page);
 await expect(page.getByText('New deployment is disabled.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Choose wallet',exact:true})).toHaveCount(0);
});
