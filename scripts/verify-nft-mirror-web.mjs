// Local production-route proof. Requires a built apps/web and a disposable localhost database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { MirrorStore } from '../apps/indexer/lib/nft-mirror/store.ts';
import { mirrorFixtureGallery } from '../apps/web/test/nft-mirror-visual-data.ts';

const endpoint=new URL(process.env.TEST_NFT_MIRROR_DATABASE_URL ?? '');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname),'Only an explicitly isolated localhost database is allowed.');
const suffix=randomUUID().replaceAll('-',''),schema=`mirror_web_${suffix}`,role=`mirror_reader_${suffix}`;
const admin=new pg.Client({connectionString:endpoint.href});
let pool,child,reader;
await admin.connect();
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:endpoint.href,options:`-c search_path=${schema}`});
  for(const file of ['033_nft_mirror.sql','034_genesis_v14_mirror.sql','035_genesis_nft_gallery.sql','036_v16_nft_mirror.sql']) await pool.query(await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8'));
  const hash=`0x${'a'.repeat(64)}`,address=`0x${'2'.repeat(40)}`;
  const config={chainId:11155111,controller:`0x${'1'.repeat(40)}`,codeHash:hash,version:13,
    fromBlock:10,confirmations:2,blockRange:2000,rpcUrl:'https://must-not-be-called.invalid'};
  const item={chainId:11155111,address,controller:config.controller,roundId:1,name:'Crimson interval',seasonId:hash,seasonName:'Color studies',
    color:'#330000',textColor:'#FFFFFF',renderer:`0x${'3'.repeat(40)}`,deploymentBlock:10,cursor:null};
  const store=new MirrorStore(pool,config),anchor={number:20,hash},check=async()=>{};
  assert.ok(await store.claim()); await store.verified(true,anchor); await store.discover([item],anchor,check);
  await store.events(item,Array.from({length:49},(_,i)=>({tokenId:i+1,block:11,blockHash:hash,transaction:hash,burned:false})),anchor,true,check);
  for (const page of [1,2,3]) for (const token of mirrorFixtureGallery(page).tokens) {
    await store.cache(item,token.tokenId,hash,{numbers:token.numbers,code:token.numbers.reduce((n,d)=>n*16+d-1,0),
      metadata:{name:token.name,image:token.image,description:'Local isolated route verification',attributes:[]}},check);
  }
  await store.release();
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`);
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  endpoint.searchParams.set('options',`-c search_path=${schema} -c role=${role}`);
  reader=new pg.Client({connectionString:endpoint.href}); await reader.connect();
  await assert.rejects(reader.query('DELETE FROM manekineko_nft_mirror_tokens'),{code:'42501'});
  const socket=createServer(); await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
  const root=new URL('../',import.meta.url);
  child=spawn(process.execPath,[fileURLToPath(new URL('node_modules/next/dist/bin/next',root)),'start','--hostname','127.0.0.1','--port',String(port)],{
    cwd:fileURLToPath(new URL('apps/web/',root)),stdio:'ignore',
    env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',DATABASE_URL:endpoint.href,NFT_MIRROR_CONTROLLERS_JSON:JSON.stringify([config])},
  });
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++) {
    assert.equal(child.exitCode,null);
    try { if((await fetch(base+'/collections',{signal:AbortSignal.timeout(1000)})).ok) break; } catch {}
    assert.ok(i<99,'Isolated Web server did not start.'); await new Promise(resolve=>setTimeout(resolve,100));
  }
  const path=`/collections/11155111/${address}`;
  for(const [url,count,first] of [[path,24,1],[path+'?page=2',24,25],[path+'?page=3',1,49]]) {
    const response=await fetch(base+url); assert.equal(response.status,200);
    const html=await response.text();
    assert.equal((html.match(/<article class="mirror-nft"/g) ?? []).length,count);
    assert.match(html,new RegExp(`NFT #<!-- -->${first}</h3>|NFT #${first}</h3>`));
    assert.ok(html.includes(`instance/${first}`));
  }
  for(const url of [path+'?page=4',path+'?page=-1','/collections/31337/'+address,'/collections/1/nope']) {
    const response=await fetch(base+url); assert.match(await response.text(),/This gallery isn/);
  }
  const activity=await fetch(base+'/api/mint-activity');
  assert.equal(activity.status,200);assert.equal(activity.headers.get('cache-control'),'no-store');
  assert.deepEqual(await activity.json(),{events:[{chainId:11155111,collection:address,name:item.name,kind:'paid',tokenId:49,transaction:hash}]});
  await pool.query('UPDATE manekineko_nft_mirror_sources SET verified=false');
  assert.deepEqual(await (await fetch(base+'/api/mint-activity')).json(),{events:[]});
  console.log('Production mint activity API passed: SELECT-only access, batch grouping, public fields and unverified-source exclusion.');
  console.log('Production gallery SSR passed: read-only PostgreSQL, 24/24/1 pagination, NFT links and invalid-route boundaries.');
} finally {
  if(child) { child.kill('SIGTERM'); await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000).unref();}); }
  await reader?.end(); await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`DROP ROLE IF EXISTS ${role}`);
  await admin.end();
}
