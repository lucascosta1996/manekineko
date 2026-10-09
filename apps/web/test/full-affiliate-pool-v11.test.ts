import {test} from 'node:test';import assert from 'node:assert/strict';import {equalAffiliatePool} from '../lib/affiliates/equal-pool.ts';
test('V11 mirrors full equal payouts, zero referrals and wei rounding while preserving capped V10',()=>{
 const p='10000000000000000';
 assert.equal(equalAffiliatePool([1],1,p,1000,2000,0,'affiliate-v11').equalShareWei,'2000000000000000000');
 assert.equal(equalAffiliatePool([1,2,3,4,5,0,0,0,0,0],1,p,1000,2000,0,'affiliate-v11').equalShareWei,'400000000000000000');
 assert.equal(equalAffiliatePool([1,1,1],1,p,1000,2000,0,'affiliate-v11').unallocatedWei,'2');
 assert.equal(equalAffiliatePool([0],1,p,1000,2000,0,'affiliate-v11').distributedWei,'0');
 assert.equal(equalAffiliatePool([1],1,p,1000,2000,3000,'affiliate-v10').equalShareWei,'3000000000000000');
 assert.throws(()=>equalAffiliatePool([1],1,p,1000,2000,0,'affiliate-v10'));
 assert.throws(()=>equalAffiliatePool([2],2,p,1000,2000,0,'affiliate-v11'));
});
