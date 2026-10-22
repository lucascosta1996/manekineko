import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const refs = [
  ['Coinbase','CEX','https://www.coinbase.com/press'],
  ['Binance','CEX','https://www.binance.com/en'],
  ['Kraken','CEX','https://www.kraken.com'],
  ['OKX','CEX','https://www.okx.com'],
  ['Gemini','CEX','https://www.gemini.com'],
  ['Crypto.com','CEX','https://crypto.com'],
  ['Bybit','CEX','https://www.bybit.com/en'],
  ['Bitget','CEX','https://www.bitget.com'],
  ['Uniswap','DEX','https://about.uniswap.org'],
  ['PancakeSwap','DEX','https://pancakeswap.finance'],
  ['Sushi','DEX','https://www.sushi.com'],
  ['1inch','DEX','https://1inch.com'],
  ['Curve','DEX','https://www.curve.finance'],
  ['Balancer','DEX','https://balancer.fi'],
  ['Jupiter','DEX / aggregator','https://jup.ag'],
  ['Raydium','DEX','https://raydium.io'],
  ['dYdX','Derivatives DEX','https://www.dydx.xyz'],
  ['Hyperliquid','Trading ecosystem','https://hyperfoundation.org'],
  ['Aave','Lending','https://aave.com/brand'],
  ['Morpho','Lending','https://morpho.org'],
  ['Compound','Lending','https://www.compound.xyz'],
  ['Lido','Staking','https://lido.fi'],
  ['Sky','Stablecoins','https://sky.money'],
  ['Ethena','Stablecoins','https://ethena.fi'],
  ['Pendle','Yield','https://www.pendle.finance'],
  ['Chainlink','Infrastructure','https://chain.link/brand-assets'],
  ['Stripe','Corporate benchmark','https://stripe.com'],
  ['Mastercard','Corporate benchmark','https://www.mastercard.com'],
  ['IBM','Corporate benchmark','https://www.ibm.com/design/language/ibm-logos/8-bar/'],
  ['Tumblr','Resemblance control','https://www.tumblr.com']
];
await mkdir(resolve(here,'references'),{recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
for(let start=0;start<refs.length;start+=5){
  await Promise.allSettled(refs.slice(start,start+5).map(async ([name,category,url],j)=>{
    const id = start+j;
    const page = await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
    await page.route('**/*',route=>route.request().resourceType()==='media'?route.abort():route.continue());
    let error=null;
    try {await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});}catch(e){error=e.message.split('\n')[0];}
    await page.waitForTimeout(1800);
    const file = `${String(id+1).padStart(2,'0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`;
    await page.screenshot({path:resolve(here,'references',file),timeout:10000}).catch(()=>{});
    const candidates=await page.locator('img, header svg, nav svg, a[href="/"] svg').evaluateAll(els=>els.map(el=>({tag:el.tagName,alt:el.getAttribute('alt'),src:el.getAttribute('src'),aria:el.getAttribute('aria-label'),class:el.getAttribute('class'),width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height),y:Math.round(el.getBoundingClientRect().y)})).filter(e=>e.y>=0&&e.y<250&&e.width>20&&e.height>12).slice(0,12)).catch(()=>[]);
    const title=await page.title().catch(()=>'');
    results.push({id:id+1,name,category,requestedUrl:url,url:page.url(),title,file,error,candidates});
    console.log(JSON.stringify({name,title,error}));
    await page.close();
  }));
}
await browser.close();
results.sort((a,b)=>a.id-b.id);
await writeFile(resolve(here,'references','capture.json'),JSON.stringify({date:'2026-10-21',method:'Official-site browser capture; visual interpretation recorded separately.',results},null,2)+'\n');
const tiles=[];
for (let i=0;i<results.length;i++){
  const r=results[i], x=(i%5)*320,y=Math.floor(i/5)*232;
  const img=await sharp(resolve(here,'references',r.file)).resize(320,200).png().toBuffer();
  tiles.push({input:img,left:x,top:y+32});
  const label=Buffer.from(`<svg width="320" height="32"><rect width="320" height="32" fill="#e8e8e8"/><text x="10" y="22" font-family="Helvetica" font-size="15" fill="#111">${r.id}. ${r.name}</text></svg>`);
  tiles.push({input:label,left:x,top:y});
}
await sharp({create:{width:1600,height:Math.ceil(results.length/5)*232,channels:3,background:'#ffffff'}}).composite(tiles).png().toFile(resolve(here,'references','contact-sheet.png'));
