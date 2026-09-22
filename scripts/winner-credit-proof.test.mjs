import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ZeroHash } from 'ethers';
import { buildLegacyCreditChain, verifyLegacyCredit, validateLegacyCreditManifest, legacyCreditLeaf } from '../packages/contracts/src/winner-credits.ts';
const win = {sourceRound:'0x'+'11'.repeat(20),holder:'0x'+'22'.repeat(20),tokenId:'3',paidAt:'1000',transactionHash:'0x'+'33'.repeat(32)};
for (const size of [1,2,3,5,20]) test(`legacy proofs bind every winner in a ${size}-entry tree`,()=>{
  const wins=Array.from({length:size},(_,i)=>({...win,sourceRound:'0x'+(i+1).toString(16).padStart(40,'0')}));
  const tree=buildLegacyCreditChain(11155111,wins);
  for(const entry of tree.entries) {
    assert.equal(verifyLegacyCredit(tree.chainId,entry,entry.proof,tree.root),true);
    for(const tampered of [{...entry,holder:win.sourceRound},{...entry,tokenId:'4'},{...entry,paidAt:'1001'},{...entry,transactionHash:ZeroHash}]) assert.equal(verifyLegacyCredit(tree.chainId,tampered,entry.proof,tree.root),false);
    assert.equal(verifyLegacyCredit(1,entry,entry.proof,tree.root),false);
  }
  assert.deepEqual(buildLegacyCreditChain(11155111,[...wins].reverse()),tree);
});
test('duplicate collection rewards and noncanonical unsigned quantities are rejected',()=>{
  assert.throws(()=>buildLegacyCreditChain(11155111,[win,win]));
  for(const tokenId of ['0','01','-1','1.1',(1n<<256n).toString()]) assert.throws(()=>legacyCreditLeaf(11155111,{...win,tokenId}));
  assert.equal(verifyLegacyCredit(11155111,win,[],ZeroHash),false);
  assert.throws(()=>validateLegacyCreditManifest({schemaVersion:1,chains:[{chainId:11155111,root:ZeroHash,entries:[{...win,proof:[]}]}]}));
});
test('bundled legacy snapshot is self-consistent and network isolated',async()=>{
  const manifest=validateLegacyCreditManifest(JSON.parse(await readFile(new URL('../packages/contracts/src/winner-credits-legacy.json',import.meta.url),'utf8')));
  assert.equal(manifest.chains.length,1);
  assert.equal(manifest.chains[0].chainId,11155111);
  assert.equal(manifest.chains[0].entries.length,1);
  assert.equal(manifest.chains[0].entries[0].tokenId,'3');
});
