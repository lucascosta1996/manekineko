import {Contract,getAddress,getCreateAddress,keccak256,id,toBeHex,zeroPadValue,type Provider} from 'ethers';
import abi from '@manekineko/contract-abi/tincta-rewards' with {type:'json'};
import build from '@manekineko/contract-abi/tincta-rewards-verification' with {type:'json'};
export const TINCTA_VERSION = 18 as const; // Internal adapter discriminator; public identity is Tincta Rewards.
export const TINCTA_COORDINATOR='0xD7f86b4b8Cae7D942340FF628F82735b7a20893a';
export const TINCTA_COORDINATOR_HASH='0xbe4ae0321fb1c74c80eea0c14c9c7b28c69ce17df15222e27b1e934cc98f5f61';
export const TINCTA_KEY_HASH='0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9';
export const TINCTA_RANDOMNESS_RESERVE=250000000000000000n;
export const TINCTA_SPONSORSHIP_RESERVE=200000000000000000n;
export const TINCTA_OPTIONS=[
 {supply:1000n,price:10000000000000000n,winners:6n,duration:86400n},
 {supply:2000n,price:20000000000000000n,winners:4n,duration:86400n},
 {supply:1000n,price:10000000000000000n,winners:10n,duration:86400n},
];
export function expectedTinctaRuntime(address:string,chainId=1):string {
 const values:Record<string,string>={identityChain:zeroPadValue(toBeHex(chainId),32),engine:zeroPadValue(getCreateAddress({from:getAddress(address),nonce:1}),32)};
 let code=build.runtimeTemplate;
 for(const [name,spans]of Object.entries(build.immutableReferences))for(const span of spans){if(span.length!==32||!values[name])throw Error('Invalid reviewed artifact');const start=2+span.start*2;code=code.slice(0,start)+values[name].slice(2).toLowerCase()+code.slice(start+64);}
 return code;
}
/** Exact root + immutable helper verification. No signing, state changes or fallback to older contracts. */
export async function verifyTincta(provider:Provider,address:string,block?:number) {
 if((await provider.getNetwork()).chainId!==1n)throw Error('Select Ethereum Mainnet for Tincta Rewards.');
 const root=getAddress(address),engine=getCreateAddress({from:root,nonce:1}),at=block===undefined?{}:{blockTag:block};
 const [rootCode,engineCode,coordinatorCode]=await Promise.all([provider.getCode(root,block),provider.getCode(engine,block),provider.getCode(TINCTA_COORDINATOR,block)]);
 if(rootCode.toLowerCase()!==expectedTinctaRuntime(root).toLowerCase()||keccak256(engineCode)!==build.engineCodeHash||keccak256(coordinatorCode)!==TINCTA_COORDINATOR_HASH)throw Error('The Mainnet contract dependencies do not match the reviewed source.');
 const c=new Contract(root,abi,provider),[settings,version,actualEngine,supply,limit,count,timeout,reward]=await Promise.all([c.settings(at),c.CONTRACT_VERSION(at),c.engine(at),c.GENESIS_SUPPLY(at),c.GENESIS_MAX_MINTS_PER_WALLET(at),c.optionCount(at),c.RANDOMNESS_TIMEOUT(at),c.EXECUTION_REWARD(at)]);
 if(version!=='tincta-rewards-1'||getAddress(actualEngine)!==engine||supply!==1000n||limit!==2n||count!==3n||timeout!==259200n||reward!==10000000000000000n||getAddress(settings.coordinator)!==TINCTA_COORDINATOR||settings.keyHash!==TINCTA_KEY_HASH||settings.confirmations!==64n||settings.callbackGas!==200000n||settings.votingDelay!==60n||settings.votingDuration!==86400n||settings.randomnessBudget<TINCTA_RANDOMNESS_RESERVE)throw Error('The production rules do not match the reviewed configuration.');
 for(let i=0;i<3;i++){const t=await c.option(i,at);if(Object.entries(TINCTA_OPTIONS[i]).some(([key,value])=>t[key]!==value))throw Error('The voting packages do not match the approved terms.');}
 return c;
}

// Admission/preparation guard only: fee changes never disable existing holder claims.
export async function verifyReviewedOracleBudget(provider:Provider,block?:number) {
 const result=await provider.call({to:TINCTA_COORDINATOR,data:id('s_config()').slice(0,10),...(block===undefined?{}:{blockTag:block})});
 if(keccak256(result)!=='0x4e3cdf6ad87f7267b1eb632a35a6c6f8dcfa7f473c106c1984b6d4a4c938cf93')throw Error('Chainlink fees or request limits changed. Recheck the oracle budget before deploying or opening another collection. Existing claims remain available.');
}
