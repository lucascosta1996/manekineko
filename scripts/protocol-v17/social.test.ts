import test from'node:test';import assert from'node:assert/strict';
import{message,collectionStages,STAGES}from'./social-content.ts';import{observeV17}from'./social.mts';import{renderSeasonSocialImage}from'../season-runner/social-image.ts';
const input={chainId:11155111 as const,id:1,season:{id:'0x'+'11'.repeat(32),number:1,name:'Aster Study',colors:['#A96B57','#B47761','#C2846E']},collection:{id:'test:1',number:1,name:'Aster Atlas',color:'#A96B57',supply:20,mintPriceEth:'0.0001',winnerCount:10,prizePerWinnerEth:'0.00012'},appUrl:'https://app.tincta.xyz/',timestamp:1793277252};
test('accelerated posts state 20 Genesis NFTs and the actual 15-minute cutoff, never production terms',()=>{
 for(const stage of STAGES){const m=message({...input,stage});assert.match(m.post,/Sepolia testnet/);assert.doesNotMatch(m.post+' '+m.detail,/1,000|72 hours/);assert.ok(m.post.length>0)}
 assert.match(message({...input,id:0,stage:'genesis-open'}).post,/20 NFTs/);assert.match(message({...input,stage:'draw-refunds'}).post,/15 minutes/);
 assert.throws(()=>message({...input,chainId:1,stage:'genesis-open'}),/Sepolia-only/);
});
test('the exact accelerated timeout distinguishes a committed draw from permanent refunds',()=>{
 const r={voteStart:1n,saleStart:100n,deadline:700n,soldOutAt:200n,entropyAt:0n,finalizedAt:0n,prizesClaimed:0n,winners:10n};
 assert.ok(!collectionStages(r,1099n).includes('draw-refunds'));assert.ok(collectionStages(r,1100n).includes('draw-refunds'));
 assert.ok(!collectionStages({...r,entropyAt:1099n},999999n).includes('draw-refunds'));
 assert.ok(!collectionStages({...r,voteStart:0n,saleStart:0n},999999n).length);
});
test('V17 observer rejects older versions, Mainnet and unsafe public links without touching RPC',async()=>{
 const config={version:17 as const,chainId:11155111,controller:'0x'+'11'.repeat(20),controllerCodeHash:'0x'+'22'.repeat(32),rpcUrl:'https://rpc.invalid',appUrl:'https://app.tincta.xyz/',xAccountId:'123'};
 for(const version of [14,16] as const)await assert.rejects(observeV17({...config,version}),/dedicated V17/);
 await assert.rejects(observeV17({...config,chainId:1}),/dedicated V17/);
 await assert.rejects(observeV17({...config,appUrl:'http://localhost/'}),/HTTPS/);
 await assert.rejects(observeV17({...config,appUrl:'https://app.tincta.xyz/?affiliate=1'}),/origin/);
});
test('marked Genesis and timeout artwork render with the same actual test terms as post text',async()=>{
 for(const stage of ['genesis-open','draw-refunds'] as const){const m=message({...input,stage}),r=await renderSeasonSocialImage(m,{preview:true});assert.equal(r.png.readUInt32BE(16),1600);assert.equal(r.png.readUInt32BE(20),900);assert.match(r.svg,/SEPOLIA TEST/);assert.match(r.svg,/DESIGN PREVIEW/);assert.doesNotMatch(r.svg,/1,000|72 hours/);if(stage==='genesis-open'){const embedded=r.svg.match(/<image href="data:image\/svg\+xml;base64,([^"]+)/)![1];assert.match(Buffer.from(embedded,'base64').toString(),/#1 \/ 20/);assert.doesNotMatch(Buffer.from(embedded,'base64').toString(),/#1 \/ 1000/);}}
});

test('Launch fast previews use exactly the six rehearsal identities without changing the full catalog', async () => {
 const {default:catalog}=await import('../../apps/launch/catalog/sepolia.json',{with:{type:'json'}});
 const {rehearsalPreviewCatalog,previewMessage}=await import('../../packages/contracts/src/v17-social-preview.ts');
 const before=JSON.stringify(catalog),small=rehearsalPreviewCatalog(catalog);
 assert.equal(small.seasons.length,2);assert.deepEqual(small.seasons.map(s=>s.collections.length),[3,3]);
 assert.equal(small.seasons[1].collections[2].name,'Beryl Current');
 assert.match(previewMessage(catalog,0,'genesis-open').post,/20 NFTs/);
 assert.match(previewMessage(catalog,6,'draw-refunds').post,/15 minutes/);
 assert.throws(()=>previewMessage(catalog,7,'opening'),/Invalid preview/);
 assert.throws(()=>rehearsalPreviewCatalog({...catalog,chainId:1}),/Sepolia only/);
 assert.equal(JSON.stringify(catalog),before);
});
