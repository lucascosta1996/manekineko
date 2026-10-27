import test from 'node:test';
import assert from 'node:assert/strict';
import { mintActivityId, mintTransactionUrl, parseMintActivity } from '@manekineko/ui/mint-activity';
import { GET } from '../app/api/mint-activity/route';

const event = { chainId: 11155111, collection: '0x'+'a'.repeat(40), transaction: '0x'+'b'.repeat(64), name: 'Tincta Genesis', kind: 'genesis', tokenId: 1 };
test('mint feed permits Genesis and paid collections, derives explorer links and groups batch mints', () => {
  const [genesis, paid] = parseMintActivity({ events: [event, {...event,chainId:1,kind:'paid',tokenId:20,href:'https://untrusted.invalid'}] });
  assert.equal(mintTransactionUrl(genesis), `https://sepolia.etherscan.io/tx/${event.transaction}`);
  assert.equal(mintTransactionUrl(paid), `https://etherscan.io/tx/${event.transaction}`);
  assert.equal(mintActivityId(genesis), mintActivityId({...genesis,tokenId:2}));
  assert.equal('href' in paid, false);
});
test('mint feed rejects malformed, unbounded and unsupported activity', () => {
  assert.deepEqual(parseMintActivity({ events: [] }), []);
  for (const value of [null, {}, {events:null}, {events:Array(41).fill(event)}, ...[
    {chainId:31337}, {collection:'bad'}, {transaction:'javascript:alert(1)'}, {name:' '}, {name:'a'.repeat(161)},
    {name:'bad\nname'}, {kind:'transfer'}, {tokenId:0}, {tokenId:1.5}, {tokenId:65537},
  ].map(patch => ({events:[{...event,...patch}]}))]) assert.throws(() => parseMintActivity(value));
});

test('landing proxy uses the public app, validates the feed and fails quietly', async t => {
  const original=process.env.NEXT_PUBLIC_WEB_URL;
  const fetch=t.mock.method(globalThis,'fetch',async(input: URL | RequestInfo)=>{
    assert.equal(String(input),'https://app.tincta.xyz/api/mint-activity');
    return Response.json({events:[event]});
  });
  try {
    delete process.env.NEXT_PUBLIC_WEB_URL;
    const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{events:[event]});
    process.env.NEXT_PUBLIC_WEB_URL='http://insecure.invalid';
    assert.equal((await GET()).status,503);assert.equal(fetch.mock.callCount(),1);
    process.env.NEXT_PUBLIC_WEB_URL='https://app.tincta.xyz';
    fetch.mock.mockImplementation(async()=>Response.json({events:[{...event,chainId:31337}]}));
    assert.equal((await GET()).status,503);
    fetch.mock.mockImplementation(async()=>{throw new Error('private upstream detail');});
    const failed=await GET();assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'Mint activity unavailable.'});
  } finally {if(original===undefined) delete process.env.NEXT_PUBLIC_WEB_URL; else process.env.NEXT_PUBLIC_WEB_URL=original;}
});
