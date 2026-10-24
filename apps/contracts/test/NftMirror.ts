import assert from 'node:assert/strict';
import { network } from 'hardhat';
import type { JsonRpcProvider } from 'ethers';
import { RpcMirrorChain } from '../../indexer/lib/nft-mirror/chain.js';
import { decodeOnChainMetadata } from '../../../packages/contracts/src/onchain-metadata.js';
const {ethers,networkHelpers} = await network.create();

describe('NFT mirror contract integration',()=>{
  for (const version of [12,13] as const) it(`caches exact current artwork and numbers, including refunded mints (${version})`,async()=>{
    const [operator,buyer,recipient] = await ethers.getSigners();
    const price=ethers.parseEther('0.01');
    const vrf=await ethers.deployContract('VRFCoordinatorV2Mock');
    const credits=await ethers.deployContract(version===13?'ManekinekoWinnerCreditsV9':'ManekinekoWinnerCreditsV8',[operator.address,ethers.ZeroHash,ethers.ZeroAddress]);
    const controller=await ethers.deployContract(`ManekinekoSeasonControllerV${version}`,[{
      operator:operator.address,coordinator:await vrf.getAddress(),credits:await credits.getAddress(),keyHash:ethers.id('mock'),
      confirmations:64,callbackGas:200000,votingDuration:3600,votingDelay:60,randomnessBudget:price,sponsorshipBudget:price,bootstrapAllowed:true,
    },[{supply:1000,price,winners:6,duration:3600}]]);
    const deployer=await ethers.deployContract(`ManekinekoRoundDeployerV${version}`,[await controller.getAddress()]);
    await controller.bindDeployer(await deployer.getAddress());
    if(version===13) { const pool=await ethers.deployContract('ManekinekoHolderRewardsV13',[await controller.getAddress()]); await controller.bindHolderRewards(await pool.getAddress()); }
    await controller.appendCollections([{seasonId:ethers.id('Mirror test'),seasonName:'Mirror season',name:'Mirror collection',symbol:'MIRROR',color:'#330000',textColor:'#FFFFFF'}]);
    await credits.approveFactory(await controller.getAddress(),ethers.keccak256(await ethers.provider.getCode(await controller.getAddress())));
    await credits.sealFactories(); await controller.sealCatalog();
    await operator.sendTransaction({to:await controller.getAddress(),value:ethers.parseEther('1')});
    const prepared=await (await controller.prepareNext()).wait();
    const round=await ethers.getContractAt(`ManekinekoRoundV${version}`,await controller.rounds(1));
    const config={chainId:Number((await ethers.provider.getNetwork()).chainId),controller:(await controller.getAddress()).toLowerCase(),
      codeHash:ethers.keccak256(await ethers.provider.getCode(await controller.getAddress())),version,
      rpcUrl:'http://local-test.invalid',fromBlock:(await controller.deploymentTransaction()!.wait())!.blockNumber,confirmations:2,blockRange:2000};
    const chain=new RpcMirrorChain(ethers.provider as unknown as JsonRpcProvider,config);
    const discovery=await chain.block(prepared!.blockNumber);
    await chain.verify(discovery);
    const [collection]=await chain.discover(prepared!.blockNumber,discovery);
    assert.equal(collection.name,'Mirror collection');
    await networkHelpers.time.increaseTo(await round.saleStartAt());
    await round.connect(buyer).getFunction('mint')(buyer.address,3,{value:price*3n});
    await round.connect(buyer).getFunction('transferFrom')(buyer.address,recipient.address,2);
    const anchor=await chain.block(await ethers.provider.getBlockNumber());
    const mints=await chain.events(collection,prepared!.blockNumber,anchor);
    assert.deepEqual(mints.map(e=>e.tokenId),[1,2,3],'Secondary transfers do not duplicate minted NFTs.');
    const cached=await chain.artwork(collection,2,anchor);
    const expected=decodeOnChainMetadata(await round.tokenURI(2),'affiliate-v11');
    assert.deepEqual(cached.metadata,expected);
    assert.deepEqual(cached.numbers,Array.from((await round.combination(2))[0],Number));
    assert.equal(cached.code,Number((await round.combination(2))[1]));
    await networkHelpers.time.increaseTo((await round.mintDeadline())+1n);
    await round.connect(recipient).getFunction('refund')(2,recipient.address);
    const refunded=await chain.block(await ethers.provider.getBlockNumber());
    assert.deepEqual((await chain.artwork(collection,2,refunded)).metadata,cached.metadata,'A burned NFT retains its original immutable artwork.');
    assert.equal((await chain.events(collection,anchor.number+1,refunded))[0].burned,true);
    await assert.rejects(new RpcMirrorChain(ethers.provider as unknown as JsonRpcProvider,{...config,codeHash:ethers.ZeroHash}).verify(refunded),/trust_mismatch/);
  });
});
