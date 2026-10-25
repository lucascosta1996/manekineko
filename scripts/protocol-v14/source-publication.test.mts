import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keccak256, toUtf8Bytes } from 'ethers';
import { publicationCurrent } from './watch-sources.mts';
import { exactSourceJob, publishedSourceMatches, sourcifySourceMatches, publishSources } from './source-publication.mts';
const spec = { name: 'ManekinekoGenesisV14', address: '0x1111111111111111111111111111111111111111', args: ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333'] };
const job = await exactSourceJob(11155111, spec);
const source = () => ({ status: '1', result: [{ SourceCode: `{${job.sourceCode}}`, ABI: JSON.stringify([{type:'function',name:'mint',inputs:[],outputs:[],stateMutability:'nonpayable'}]), ContractName: spec.name, CompilerVersion: job.compiler, ConstructorArguments: job.constructorArguments, SimilarMatch: '', Proxy: '0' }] });
test('publication requires readable exact source, ABI, compiler, constructor and address-specific verification', () => {
  assert.equal(publishedSourceMatches(job, source()), true);
  for (const patch of [{ SourceCode: '' }, { ABI: '[]' }, { ABI: 'Contract source code not verified' }, { CompilerVersion: 'v0.8.0' }, { ContractName: 'Other' }, { ConstructorArguments: '' }, { SimilarMatch: spec.address }, { Proxy: '1' }, { SourceCode: JSON.stringify({sources:{}}) }]) {
    const value = source(); Object.assign(value.result[0], patch);
    assert.equal(publishedSourceMatches(job, value), false);
  }
  assert.equal(publishedSourceMatches(job, {status:'1',result:'submission-guid'}), false);
});
test('submission and verified-status response alone never pass the release gate; GUID resumes until source is readable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tincta-sources-')), journal = join(dir, 'jobs.json');
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const action = new URL(String(url)).searchParams.get('action')!; calls.push(action);
    return new Response(JSON.stringify(action === 'getsourcecode' ? {status:'1', result:[{ SourceCode:'' }]} : { status:'1',result:'verification-guid-123' }));
  }) as typeof fetch;
  try {
    await assert.rejects(publishSources(11155111, [spec], journal, {apiKey:'test', fetcher}), /pending/);
    const saved = JSON.parse(await readFile(journal,'utf8'))[spec.address];
    assert.equal(saved.guid, 'verification-guid-123'); assert.equal(saved.published, false);
    assert.deepEqual(calls, ['getsourcecode','verifysourcecode']);
    // A second invocation sees the same build and publicly readable source.
    const result = await publishSources(11155111, [spec], journal, {apiKey:'test', fetcher: (async () => new Response(JSON.stringify(source()))) as typeof fetch});
    assert.equal(result[0].published, true);
    await assert.rejects(publishSources(11155111, [{...spec,args:[spec.address,spec.address]}], journal, {apiKey:'test',fetcher}), /differs/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('missing explorer credentials cannot produce a release certificate', async () => {
  await assert.rejects(publishSources(11155111,[spec],'unused.json',{apiKey:''}), /key/);
});

test('source watcher never reuses a report for a new collection count or deployment', () => {
  const expected = {chainId:11155111,controller:spec.address} as any;
  const report = { status:'verified', independentRpcAgreement:true, explorerSourcesPublished:true, deploymentHash:keccak256(toUtf8Bytes(JSON.stringify(expected))), preparedCollections:0, publications:Array.from({length:7},()=>({published:true,verification:'etherscan-exact'})) };
  assert.equal(publicationCurrent(report,expected,0),true);
  assert.equal(publicationCurrent(report,expected,1),false);
  assert.equal(publicationCurrent(report,{...expected,controller:spec.args[0]},0),false);
  assert.equal(publicationCurrent({...report,explorerSourcesPublished:false},expected,0),false);
  assert.equal(publicationCurrent({...report,publications:report.publications.slice(1)},expected,0),false);
});

test('a similar Etherscan match requires exact Sourcify creation, runtime, constructor and published source', async () => {
  const proof = {match:'exact_match',creationMatch:'exact_match',runtimeMatch:'exact_match',chainId:'11155111',address:job.address,
    compilation:{compilerVersion:job.compiler.slice(1),fullyQualifiedName:job.contractName},creationBytecode:{transformationValues:{constructorArguments:'0x'+job.constructorArguments}},
    sources:JSON.parse(job.sourceCode).sources,abi:[{type:'function'}]};
  assert.equal(sourcifySourceMatches(job,proof),true);
  for(const change of [{creationMatch:'match'},{runtimeMatch:null},{chainId:'1'},{address:spec.args[0]},{sources:{}},{abi:[]},{creationBytecode:{transformationValues:{constructorArguments:'0x'}}}]) assert.equal(sourcifySourceMatches(job,{...proof,...change}),false);
  const similar = source(); similar.result[0].SimilarMatch=spec.args[0]; similar.result[0].ConstructorArguments='';
  assert.equal(publishedSourceMatches(job,similar),false);
  const dir=await mkdtemp(join(tmpdir(),'tincta-sourcify-'));
  try {const result=await publishSources(11155111,[spec],join(dir,'jobs.json'),{apiKey:'test',fetcher:(async url=>new Response(JSON.stringify(String(url).includes('sourcify.dev')?proof:similar))) as typeof fetch});
    assert.equal(result[0].verification,'sourcify-exact');assert.equal(result[0].published,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});
