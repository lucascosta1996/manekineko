import { expect } from "chai";
import { artifacts, network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const PRICE = 10_000n;
async function fixture() {
  const [owner, enrollmentSigner, first, second, recipient] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibility", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV6", [owner.address]);
  await eligibility.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  const config = { name: 'V6 "On-chain"', symbol: "NEKO6", roundId: 1n, maxSupply: 20n, mintPrice: PRICE,
    seasonId: ethers.id("season-one"), seasonName: "Season One", collectionColor: "#173C2C", textColor: "#FFFFFF",
    mintDeadline: BigInt(await time.latest()) + 86400n, initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(),
    keyHash: ethers.id("mock-vrf-key"), requestConfirmations: 64, callbackGasLimit: 200_000,
    maxAffiliateSlots: 10n, enrollmentSigner: enrollmentSigner.address, prizeBps: 5000n, affiliatePoolBps: 1000n, affiliateEligibility: await eligibility.getAddress() };
  await factory.createRound(config);
  const round = await ethers.getContractAt("ManekinekoRoundV6", await factory.rounds(1));
  await eligibility.registerCollection(await factory.getAddress(), 1);
  await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
  await round.activateSale();
  return { factory, round, coordinator, config, owner, enrollmentSigner, first, second, recipient, eligibility };
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function reveal(c: Context) {
  await c.round.connect(c.first).mint(c.first.address, 8, { value: PRICE * 8n });
  await c.round.connect(c.second).mint(c.second.address, 12, { value: PRICE * 12n });
  await c.round.requestRandomness();
  await c.coordinator.fulfillRequest(await c.round.requestId(), 234n);
  await expect(c.round.finalizeDraw(8)).to.emit(c.round, "BatchMetadataUpdate").withArgs(1n,20n);
}
function copyNumbers(numbers: readonly bigint[]): [bigint,bigint,bigint,bigint] {
  return [numbers[0],numbers[1],numbers[2],numbers[3]];
}
function decodeMetadata(uri: string) {
  expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
  const metadata = JSON.parse(Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8"));
  expect(metadata.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
  return { metadata, svg: Buffer.from(metadata.image.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8") };
}

describe("V6 scrambled combinations preserve the V5 financial lifecycle", function () {
  this.timeout(180_000);
  it("keeps every deployment within EIP-170 and EIP-3860 limits with independent immutable rounds", async () => {
    for (const name of ["ManekinekoRoundV6", "ManekinekoRendererV6", "ManekinekoRoundDeployerV6", "ManekinekoFactoryV6"] as const) {
      const artifact = await artifacts.readArtifact(name);
      expect((artifact.deployedBytecode.length - 2) / 2, `${name} runtime`).to.be.at.most(24_576);
      expect((artifact.bytecode.length - 2) / 2, `${name} initcode`).to.be.lessThan(49_152);
    }
    const c = await loadFixture(fixture);
    expect(await c.round.CONTRACT_VERSION()).to.equal("affiliate-v6");
    expect(await c.round.ALGORITHM_VERSION()).to.equal("unique-rank-v3");
    expect(await c.round.renderer()).to.equal(await c.factory.renderer());
    const deployer = await ethers.getContractAt("ManekinekoRoundDeployerV6", await c.factory.deployer());
    await expect(deployer.deploy(c.config, await c.factory.renderer())).to.be.revertedWithCustomError(deployer,"OnlyFactory");
  });
  it("leaves numbers and key sealed until reveal with self-contained SVG metadata", async () => {
    const c = await loadFixture(fixture);
    await c.round.connect(c.first).mint(c.first.address, 1, { value: PRICE });
    await expect(c.round.combination(1)).to.be.revertedWithCustomError(c.round,"RevealNotAvailable");
    await expect(c.round.combinationKey()).to.be.revertedWithCustomError(c.round,"RevealNotAvailable");
    await expect(c.round.scoreCombination([1,1,1,1])).to.be.revertedWithCustomError(c.round,"RevealNotAvailable");
    const { metadata, svg } = decodeMetadata(await c.round.tokenURI(1));
    expect(metadata.contract_version).to.equal("affiliate-v6");
    expect(metadata.algorithm_version).to.equal("unique-rank-v3");
    expect(metadata.attributes).to.deep.equal([{ trait_type:"Status", value:"Sealed" }]);
    expect(svg).to.contain("Sealed until VRF reveal");
    expect(svg).not.to.match(/<(?:script|image|foreignObject)\b|(?:href|src)=/i);
  });
  it("reveals 20 distinct combinations whose on-chain inverse scores are 1..20 and preserves the sole winner", async () => {
    const c = await loadFixture(fixture); await reveal(c);
    const key = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "uint256", "address", "uint256", "uint256"],
      [ethers.id("MANEKINEKO_COMBINATION_V3"),234n,31337n,await c.round.getAddress(),1n,20n]));
    expect(await c.round.combinationKey()).to.equal(key);
    const scores: bigint[] = [], codes: bigint[] = [], winners: bigint[] = [];
    const offset = await c.round.drawOffset();
    for (let id = 1n; id <= 20n; id++) {
      const [numbers, code, score] = await c.round.combination(id);
      expect(score).to.equal(1n + (id - 1n + offset) % 20n);
      expect(await c.round.scoreCombination(copyNumbers(numbers))).to.equal(score);
      expect(code).to.equal(numbers.reduce((result, n) => (result << 4n) | (n - 1n), 0n));
      const { metadata, svg } = decodeMetadata(await c.round.tokenURI(id));
      const traits = new Map<string, number>(metadata.attributes.map((trait: { trait_type:string; value:number }) => [trait.trait_type,trait.value]));
      expect(["A","B","C","D"].map(name => BigInt(traits.get(name)!))).to.deep.equal(copyNumbers(numbers));
      expect(BigInt(traits.get("Score")!)).to.equal(score); expect(BigInt(traits.get("Combination code")!)).to.equal(code);
      expect(svg).to.contain(numbers.join(" / ")); expect(svg).to.contain(`SCORE ${score}`);
      expect(metadata.description).to.contain("scoreCombination([a,b,c,d])");
      scores.push(score); codes.push(code); if(score===20n)winners.push(id);
    }
    expect(new Set(codes.map(String)).size).to.equal(20);
    expect(scores.sort((a,b)=>Number(a-b))).to.deep.equal(Array.from({length:20},(_,i)=>BigInt(i+1)));
    expect(winners).to.deep.equal([20n-offset]); expect(await c.round.winningTokenId()).to.equal(winners[0]);
    await expect(c.round.finalizeDraw(1)).to.be.revertedWithCustomError(c.round,"InvalidPhase");
    await expect(c.round.requestRandomness()).to.be.revertedWithCustomError(c.round,"InvalidPhase");
    const harness = await ethers.deployContract("ScrambledRankHarness");
    await expect(c.round.scoreCombination([0,1,1,1])).to.be.revertedWithCustomError(harness,"InvalidNumber").withArgs(0,0);
    const unmintable = copyNumbers(await harness.numbers(await harness.encode(20,key)));
    await expect(c.round.scoreCombination(unmintable)).to.be.revertedWithCustomError(harness,"InvalidRank").withArgs(21,20);
    expect(await c.round.combination.estimateGas(1)).to.be.lessThan(100_000n);
    expect(await c.round.scoreCombination.estimateGas(copyNumbers((await c.round.combination(1))[0]))).to.be.lessThan(100_000n);
  });
  it("still pays the current winning holder and prevents non-winners from withdrawing the prize", async () => {
    const c = await loadFixture(fixture); await reveal(c);
    const winningId = await c.round.winningTokenId();
    const holder = winningId <= 8n ? c.first : c.second, nonWinner = winningId <= 8n ? c.second : c.first;
    await expect(c.round.withdraw(c.owner.address, 1)).to.be.revertedWithCustomError(c.round,"InsufficientWithdrawableBalance");
    await expect(c.round.connect(holder).transferFrom(holder.address,c.recipient.address,winningId)).to.be.revertedWithCustomError(c.round,"TransfersLocked");
    await time.increaseTo(await c.round.finalizedAt() + await c.round.PRIZE_CLAIM_DELAY());
    await expect(c.round.connect(nonWinner).claimPrize(nonWinner.address)).to.be.revertedWithCustomError(c.round,"NotTokenHolder");
    await expect(c.round.connect(c.owner).claimPrize(c.owner.address)).to.be.revertedWithCustomError(c.round,"NotTokenHolder");
    await expect(c.round.connect(holder).claimPrize(c.recipient.address)).to.changeEtherBalance(ethers,c.recipient,100_000n);
    expect(await c.round.prizePaidAmount()).to.equal(100_000n);
    expect(await c.round.withdrawableBalance()).to.equal(100_000n);
    await c.round.withdraw(c.owner.address,100_000n);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).to.equal(0n);
    expect(await c.round.readyForNextRound()).to.equal(true);
    await c.factory.createRound({...c.config,roundId:2n,mintDeadline:BigInt(await time.latest())+86400n});
    expect(await c.factory.roundCount()).to.equal(2n);
  });
  it("keeps referral enrollment, reserved pool and post-sellout affiliate claims unchanged", async () => {
    const c = await loadFixture(fixture);
    const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibility", [c.owner.address]);
    const factory = await ethers.deployContract("ManekinekoFactoryV6", [c.owner.address]);
    await eligibility.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
    await factory.createRound({ ...c.config, affiliateEligibility: await eligibility.getAddress() });
    const round = await ethers.getContractAt("ManekinekoRoundV6", await factory.rounds(1));
    await eligibility.registerCollection(await factory.getAddress(), 1);
    const nonce = ethers.id("V6 affiliate fixture"), deadline = BigInt(await time.latest()) + 600n;
    const signature = await c.enrollmentSigner.signTypedData(
      {name:"ManekinekoAffiliateEnrollment",version:"4",chainId:31337,verifyingContract:await round.getAddress()},
      {Enrollment:[{name:"applicant",type:"address"},{name:"affiliateId",type:"uint256"},{name:"poolBps",type:"uint256"},{name:"sourceCollection",type:"address"},{name:"sourceTokenId",type:"uint256"},{name:"nonce",type:"bytes32"},{name:"deadline",type:"uint256"}]},
      {applicant:c.recipient.address,affiliateId:1,poolBps:1000,sourceCollection:ethers.ZeroAddress,sourceTokenId:0,nonce,deadline});
    await round.connect(c.recipient).enrollAffiliate(c.recipient.address,1,1000,ethers.ZeroAddress,0,nonce,deadline,signature);
    await round.fundRandomness({value:await c.coordinator.MOCK_FEE()}); await round.activateSale();
    await round.connect(c.first).mintWithAffiliate(c.first.address,20,1,{value:PRICE*20n});
    expect(await round.affiliateClaimable(1)).to.equal(20_000n);
    expect(await round.withdrawableBalance()).to.equal(0n);
    await round.requestRandomness(); await c.coordinator.fulfillRequest(await round.requestId(),234n); await round.finalizeDraw(8);
    await expect(round.distributePrize()).to.changeEtherBalance(ethers,c.first,100_000n);
    expect(await round.withdrawableBalance()).to.equal(80_000n);
    await round.withdraw(c.owner.address,80_000n);
    await expect(round.connect(c.recipient).claimAffiliateCommission(c.second.address)).to.changeEtherBalance(ethers,c.second,20_000n);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
  });
  it("preserves full unsold refunds to the current holder and burns refunded NFTs", async () => {
    const c = await loadFixture(fixture);
    await c.round.connect(c.first).mint(c.first.address,1,{value:PRICE});
    await c.round.connect(c.first).transferFrom(c.first.address,c.second.address,1);
    await time.increaseTo(c.config.mintDeadline);
    const {metadata,svg}=decodeMetadata(await c.round.tokenURI(1));
    expect(metadata.attributes).to.deep.equal([{trait_type:"Status",value:"Refundable"}]);
    expect(svg).to.contain("Refund available");
    await expect(c.round.connect(c.first).refund(1,c.first.address)).to.be.revertedWithCustomError(c.round,"NotTokenHolder");
    await expect(c.round.connect(c.second).refund(1,c.recipient.address)).to.changeEtherBalance(ethers,c.recipient,PRICE);
    expect(await c.round.totalRefunded()).to.equal(PRICE);
    await expect(c.round.tokenURI(1)).to.be.revertedWithCustomError(c.round,"ERC721NonexistentToken");
    expect(await c.round.withdrawableBalance()).to.equal(0n);
  });
});
