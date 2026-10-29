import test from 'node:test';
import assert from 'node:assert/strict';
import {AbiCoder, Interface, ZeroHash, concat, toBeHex} from 'ethers';
import {delegationManager, matchesWalletIntent, requestWalletTransaction} from '../../../packages/protocol/src/wallet-transaction.ts';
const wallet='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),other='0x'+'3'.repeat(40),hash='0x'+'4'.repeat(64);
const intent={wallet,to,data:'0x12345678',value:'200000000000000',chainId:11155111,nonce:15};
const direct={from:wallet,to,data:intent.data,value:BigInt(intent.value),chainId:11155111n,nonce:15};
const coder=AbiCoder.defaultAbiCoder(),api=new Interface(['function redeemDelegations(bytes[],bytes32[],bytes[])']);
const type='tuple(address delegate,address delegator,bytes32 authority,tuple(address enforcer,bytes terms,bytes args)[] caveats,uint256 salt,bytes signature)[]';
const context=(delegator=wallet)=>coder.encode([type],[[[wallet,delegator,'0x'+'ff'.repeat(32),[],0,'0x']]]);
const execution=concat([to,toBeHex(BigInt(intent.value),32),intent.data]);
const wrapped=(contexts=[context()],modes=[ZeroHash],calls=[execution])=>({...direct,to:delegationManager,value:0n,data:api.encodeFunctionData('redeemDelegations',[contexts,modes,calls])});
test('the wallet receives the reviewed payment exactly and estimates its own execution, without a direct-call gas cap',async()=>{
 const requests:any[]=[];const result=await requestWalletTransaction({request:async(args)=>{requests.push(args);return hash;}},intent);
 assert.equal(result,hash);assert.deepEqual(requests,[{method:'eth_sendTransaction',params:[{from:wallet,to,data:intent.data,value:'0xb5e620f48000',chainId:'0xaa36a7',nonce:'0xf'}]}]);
});
test('wallet rejection is preserved and an unknown response is never treated as a sent transaction',async()=>{
 const rejected=Object.assign(new Error('Rejected'),{code:4001});await assert.rejects(requestWalletTransaction({request:async()=>{throw rejected;}},intent),error=>error===rejected);
 await assert.rejects(requestWalletTransaction({request:async()=>({hash})},intent),/did not return a transaction hash/);
});
test('recovery matches direct calls and one atomic MetaMask self-delegated execution',()=>{
 assert.equal(matchesWalletIntent(direct,intent),true);assert.equal(matchesWalletIntent(wrapped(),intent),true);
 assert.equal(matchesWalletIntent(wrapped([coder.encode([type],[[]])]),intent),true);
 for(const change of [{from:other},{chainId:1n},{nonce:16},{data:'0x87654321'},{value:1n},{to:other}])assert.equal(matchesWalletIntent({...direct,...change},intent),false);
 for(const change of [{from:other},{chainId:1n},{nonce:16},{value:1n},{to:other}])assert.equal(matchesWalletIntent({...wrapped(),...change},intent),false);
});
test('recovery rejects another execution account, multiple calls, non-atomic modes and malformed envelopes',()=>{
 const cases=[wrapped([context(other)]),wrapped([context(),context()],[ZeroHash,ZeroHash],[execution,execution]),wrapped([context()],[toBeHex(1n,32)]),wrapped([context()],[ZeroHash],[concat([other,toBeHex(BigInt(intent.value),32),intent.data])]),wrapped([context()],[ZeroHash],[concat([to,toBeHex(0,32),intent.data])]),wrapped([context()],[ZeroHash],[execution+'00']),wrapped(['0x']),{...wrapped(),data:'0xcef6d209'}];
 for(const tx of cases)assert.equal(matchesWalletIntent(tx,intent),false);
});
