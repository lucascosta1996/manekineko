import {readFile,writeFile} from 'node:fs/promises';
import {keccak256} from 'ethers';
const root=new URL('../../',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const artifact=await read('apps/contracts/artifacts/contracts/TinctaRewards.sol/TinctaRewards.json');
const engine=await read('apps/contracts/artifacts/contracts/TinctaEngine.sol/TinctaEngine.json');
const info=await read(`apps/contracts/artifacts/build-info/${artifact.buildInfoId}.json`),{output}=await read(`apps/contracts/artifacts/build-info/${artifact.buildInfoId}.output.json`);
if(/manekineko|maneki[ -]?neko|\bv17\b/i.test(JSON.stringify(info.input)))throw Error('Prototype branding in production source graph');
const names=new Map();function visit(n){if(!n||typeof n!=='object')return;if(n.nodeType==='VariableDeclaration'&&n.mutability==='immutable')names.set(n.id,n.name);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v)}
Object.values(output.sources).forEach(s=>visit(s.ast));
const immutableReferences=Object.fromEntries(Object.entries(artifact.immutableReferences).map(([id,spans])=>{if(!names.has(Number(id)))throw Error('Unknown immutable');return[names.get(Number(id)),spans]}));
if(Object.keys(immutableReferences).sort().join(',')!=='engine,identityChain')throw Error('Review immutable change');
for(const a of [artifact,engine])if((a.deployedBytecode.length-2)/2>24576||(a.bytecode.length-2)/2>49152)throw Error('Mainnet size limit exceeded');
const verification={contract:'TinctaRewards',contractVersion:'tincta-rewards-1',compiler:info.solcLongVersion,sourceName:artifact.inputSourceName,runtimeTemplate:artifact.deployedBytecode,immutableReferences,engineCodeHash:keccak256(engine.deployedBytecode),creationCodeHash:keccak256(artifact.bytecode)};
const files={
 'packages/contracts/src/TinctaRewards.json':artifact.abi,
 'packages/contracts/src/TinctaEngine.json':engine.abi,
 'packages/contracts/src/tincta-rewards-verification.json':verification,
 'packages/contracts/src/tincta-rewards-build.json':{...verification,abi:artifact.abi,bytecode:artifact.bytecode,engineRuntime:engine.deployedBytecode},
 'packages/contracts/src/tincta-rewards-source.json':{compiler:info.solcLongVersion,contractName:artifact.inputSourceName+':TinctaRewards',input:info.input},
};
for(const[path,value]of Object.entries(files)){const content=JSON.stringify(value,null,2)+'\n';if(process.argv.includes('--check')){if(await readFile(new URL(path,root),'utf8')!==content)throw Error(`Generated output differs: ${path}`)}else await writeFile(new URL(path,root),content);}
console.log('Tincta production artifacts verified:',Object.keys(files).length);
