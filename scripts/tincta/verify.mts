/** Read-only production admission. Never loads a private key or sends a transaction. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isHexString, getCreateAddress } from 'ethers';
import { deploymentData, recoverDeployment, mainnetReaders } from '../../packages/protocol/src/tincta-deployment.ts';
import { verifyTincta } from '../../packages/protocol/src/tincta.ts';
import { catalogPlans } from '../../packages/protocol/src/tincta-setup.ts';
import catalog from '../../apps/launch/catalog/mainnet.json' with { type: 'json' };
const args=process.argv.slice(2),value=(key:string)=>args[args.indexOf(key)+1];
if(!args.includes('--transaction')||!isHexString(value('--transaction'),32))throw Error('Usage: npm run tincta:verify -- --transaction 0xCONFIRMED_CREATION_HASH [--output DIRECTORY]');
const hash=value('--transaction'),readers=mainnetReaders();
try{
 const tx=await readers[0].getTransaction(hash);if(!tx)throw Error('Transaction unavailable');
 const intent={schema:1 as const,chainId:1 as const,from:tx.from,nonce:tx.nonce,data:await deploymentData(tx.from),createdAt:Date.now(),hash};
 const proof=await recoverDeployment(intent,hash,readers);
 if(!proof||proof.status!=='deployed')throw Error('A confirmed, matching production deployment is required.');
 const root=await verifyTincta(readers[0],proof.address),plans=catalogPlans(catalog),count=Number(await root.catalogCount());
 if(count>plans.length)throw Error('Unexpected catalog length');
 for(let i=0;i<count;i++){const actual=await root.collection(i+1);if(Object.entries(plans[i]).some(([key,val])=>actual[key]!==val))throw Error(`Catalog mismatch at ${i+1}`);}
 const projection={chainId:1,version:18,controller:proof.address.toLowerCase(),codeHash:proof.codeHash,rpcUrl:'https://ethereum-rpc.publicnode.com',fromBlock:proof.block,confirmations:12,blockRange:2000};
 const output=resolve(args.includes('--output')?value('--output'):'.private/tincta-mainnet');await mkdir(output,{recursive:true,mode:0o700});
 const record={name:'Tincta Rewards',contractVersion:'tincta-rewards-1',verifiedAt:new Date().toISOString(),transactionHash:hash,operator:tx.from,...proof,engine:getCreateAddress({from:proof.address,nonce:1}),catalogCount:count,catalogSealed:await root.catalogSealed(),publicActivation:'pending',xDelivery:'disabled',evidence:'Two independent Mainnet receipts and exact reviewed root/helper/dependency code. No transaction submitted by this command.'};
 await writeFile(resolve(output,'deployment.json'),JSON.stringify(record,null,2)+'\n');
 await writeFile(resolve(output,'publication.json'),JSON.stringify({publicEnvironment:{NEXT_PUBLIC_TINCTA_MAINNET_ADDRESS:proof.address,NEXT_PUBLIC_TINCTA_MAINNET_CODE_HASH:proof.codeHash,NEXT_PUBLIC_TINCTA_MAINNET_RPC_URL:projection.rpcUrl},indexerSource:projection,galleryPin:{chainId:1,version:18,controller:projection.controller,codeHash:projection.codeHash},instructions:'Merge these entries with existing historical pins. Apply migration 040 before activation. Publish Web and Launch together; retain Sepolia sources. Do not enable X without an approved Mainnet account and separate source registration.'},null,2)+'\n');
 console.log(JSON.stringify({verified:true,address:proof.address,engine:record.engine,block:proof.block,catalogCount:count,output,blockchainWrites:0}));
}finally{readers.forEach(p=>p.destroy());}
