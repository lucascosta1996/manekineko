import { expect } from 'chai';
import { network } from 'hardhat';
import { verifyTincta } from '../../../packages/protocol/src/tincta.ts';
const enabled=!!process.env.MAINNET_FORK_URL;
(enabled?describe:describe.skip)('Tincta Rewards against a read-only Mainnet fork',function(){
 this.timeout(300000);
 it('verifies the actual coordinator, creates and funds a real implementation subscription, and accepts the fixed request parameters',async()=>{
  const {ethers,networkHelpers}=await network.create('tinctaMainnetFork'),[operator]=await ethers.getSigners();
  const c=await ethers.deployContract('TinctaRewards',[operator.address,ethers.parseEther('0.25'),ethers.parseEther('0.2')]);
  await verifyTincta(ethers.provider,await c.getAddress());
  await c.appendCollections([{seasonId:ethers.id('Tincta fork verification'),seasonName:'Fork verification',name:'Read only model',color:'#330000',textColor:'#FFFFFF'}]);
  await c.fundOperating({value:ethers.parseEther('0.46')});await c.sealCatalog();
  const coordinator=new ethers.Contract((await c.settings()).coordinator,[
   'function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)',
   'function pendingRequestExists(uint256) view returns(bool)',
  ],ethers.provider);
  const first=await c.round(1),sub=await coordinator.getSubscription(first.subscription);
  expect(sub.nativeBalance).eq(ethers.parseEther('0.25'));expect(sub.owner).eq(await c.getAddress());expect(sub.consumers).deep.eq([await c.getAddress()]);
  // Impersonation is confined to the disposable EVM. Exercise the actual
  // coordinator's accepted request path with the root's fixed settings.
  await networkHelpers.setBalance(await c.getAddress(),ethers.parseEther('1'));
  const consumer=await ethers.getImpersonatedSigner(await c.getAddress());
  const request=new ethers.Contract((await c.settings()).coordinator,[
   'function requestRandomWords((bytes32 keyHash,uint256 subId,uint16 requestConfirmations,uint32 callbackGasLimit,uint32 numWords,bytes extraArgs)) returns(uint256)',
  ],consumer);
  const settings=await c.settings();
  const extra=ethers.concat([ethers.id('VRF ExtraArgsV1').slice(0,10),ethers.AbiCoder.defaultAbiCoder().encode(['bool'],[true])]);
  await request.requestRandomWords([settings.keyHash,first.subscription,settings.confirmations,settings.callbackGas,1,extra]);
  expect(await coordinator.pendingRequestExists(first.subscription)).eq(true);
  expect((await coordinator.getSubscription(first.subscription)).nativeBalance).eq(ethers.parseEther('0.25'));
  // Fork state is disposable. No oracle fulfills the fork and no chain transaction is broadcast.
 });
});
