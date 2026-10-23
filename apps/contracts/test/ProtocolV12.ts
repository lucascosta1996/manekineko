import { expect } from "chai";
import { artifacts, network } from "hardhat";
import { readProtocol } from "../../web/lib/protocol/chain.js";
import { readCatalog } from "../../../packages/protocol/src/progress.js";
import { compiled, verifyDeployment } from "../../../scripts/protocol-v12/verify-deployment.mjs";
import { executeOnce } from "../../../scripts/protocol-v12/executor.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const PRICE = ethers.parseEther("0.01");
const SUPPLY = 1000n;
const EXECUTION = ethers.parseEther("0.01");
const REVENUE = PRICE * SUPPLY;
const POOL = REVENUE / 5n;
const PRIZE_POOL = (REVENUE * 3n) / 5n;
const choices = [
  { supply: SUPPLY, price: PRICE, winners: 6n, duration: 3600n },
  { supply: SUPPLY * 2n, price: PRICE * 2n, winners: 4n, duration: 86400n },
  { supply: SUPPLY * 2n, price: PRICE, winners: 6n, duration: 3600n },
];
async function fixture() { return setup(false); }
async function importFixture() { return setup(true); }
async function setup(withImportController: boolean) {
  const [operator, buyer, other, ...affiliates] = await ethers.getSigners();
  const vrf = await ethers.deployContract("VRFCoordinatorV2Mock");
  const credits = await ethers.deployContract("ManekinekoWinnerCreditsV8", [
    operator.address,
    ethers.ZeroHash,
    ethers.ZeroAddress,
  ]);
  const settings = {
    operator: operator.address,
    coordinator: await vrf.getAddress(),
    credits: await credits.getAddress(),
    keyHash: ethers.id("mock-key"),
    confirmations: 64,
    callbackGas: 200000,
    votingDuration: 3600,
    votingDelay: 60,
    randomnessBudget: ethers.parseEther("0.01"),
    sponsorshipBudget: PRICE * 2n,
    bootstrapAllowed: true,
  };
  const controller = await ethers.deployContract(
    "ManekinekoSeasonControllerV12",
    [settings, choices]
  );
  const deployer = await ethers.deployContract("ManekinekoRoundDeployerV12", [
    await controller.getAddress(),
  ]);
  await controller.bindDeployer(await deployer.getAddress());
  await credits.approveFactory(
    await controller.getAddress(),
    ethers.keccak256(
      await ethers.provider.getCode(await controller.getAddress())
    )
  );
  await controller.appendCollections(
    Array.from({ length: 3 }, (_, i) => ({
      seasonId: ethers.id(i < 2 ? "First season" : "Second season"),
      seasonName: i < 2 ? "First season" : "Second season",
      name: `Test ${i + 1}`,
      symbol: `TEST${i + 1}`,
      color: "#330000",
      textColor: "#FFFFFF",
    }))
  );
  const importedController = withImportController ? await ethers.deployContract(
    "ManekinekoSeasonControllerV12", [{ ...settings, bootstrapAllowed: false }, choices]
  ) : null;
  if (importedController) await credits.approveFactory(
    await importedController.getAddress(), ethers.keccak256(await ethers.provider.getCode(await importedController.getAddress()))
  );
  // A catalog cannot launch while reward-source authority remains mutable.
  await expect(controller.sealCatalog()).revertedWithCustomError(controller, "InvalidConfiguration");
  await expect(credits.connect(other).sealFactories()).revertedWithCustomError(credits, "OwnableUnauthorizedAccount");
  await credits.sealFactories();
  await controller.sealCatalog();
  await operator.sendTransaction({
    to: await controller.getAddress(),
    value: ethers.parseEther("1"),
  });
  await controller.connect(other).prepareNext();
  const round = await ethers.getContractAt(
    "ManekinekoRoundV12",
    await controller.rounds(1)
  );
  const voting = await ethers.getContractAt(
    "ManekinekoVotingV12",
    await controller.voting()
  );
  return {
    operator,
    buyer,
    other,
    affiliates,
    vrf,
    credits,
    controller,
    round,
    voting,
    settings,
    importedController,
  };
}
type C = Awaited<ReturnType<typeof fixture>>;
async function open(c: C) {
  await time.increaseTo(await c.round.saleStartAt());
}
async function sell(c: C) {
  await open(c);
  await c.round
    .connect(c.buyer)
    .mint(c.buyer.address, 20, { value: PRICE * 20n });
  await fillRemaining(c);
}
async function fillRemaining(c: C) {
  const supply = await c.round.maxSupply(),
    price = await c.round.mintPrice();
  for (let minted = await c.round.totalMinted(); minted < supply; ) {
    const quantity = supply - minted < 20n ? supply - minted : 20n;
    // Actual paid mints to distinct local recipients preserve the 20-primary-mint cap.
    const recipient = ethers.getAddress(
      ethers.dataSlice(ethers.id(`V12 filler ${minted}`), 12)
    );
    await c.round
      .connect(c.operator)
      .mint(recipient, quantity, { value: price * quantity });
    minted += quantity;
  }
}
async function awardSigner(c: C, rank: number) {
  const owner = await c.round.ownerOf(await c.round.winningTokenIds(rank));
  const signer = await ethers.getImpersonatedSigner(owner);
  if ((await ethers.provider.getBalance(owner)) === 0n)
    await networkHelpers.setBalance(owner, ethers.parseEther("1"));
  return signer;
}
async function claimAwards(c: C) {
  for (let rank = 1; rank <= 6; rank++) {
    const holder = await awardSigner(c, rank);
    await c.round.connect(holder).claimPrizeForRank(rank, holder.address);
  }
}
async function reveal(c: C) {
  await c.vrf.fulfillRequest(await c.round.requestId(), 0);
  await c.round.connect(c.other).finalizeDrawAndClaim(c.other.address);
}
async function next(c: C) {
  await c.controller.connect(c.other).prepareNext();
  return ethers.getContractAt(
    "ManekinekoRoundV12",
    await c.controller.rounds(await c.controller.roundCount())
  );
}
async function loser(c: C) {
  const wins = new Set(
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        c.round.winningTokenIds(i + 1).then(String)
      )
    )
  );
  return Array.from({ length: 20 }, (_, i) => i + 1).find(
    (i) => !wins.has(String(i))
  )!;
}
describe("V12 deadline protocol and immutable economics", function () {
  this.timeout(180000);
  it("verifies the complete deployment graph and rejects modified code stores, dependencies and catalog identities", async () => {
    const c = await loadFixture(fixture);
    const expected = {
      chainId: 31337, controller: await c.controller.getAddress(), controllerCodeHash: ethers.keccak256(await ethers.provider.getCode(await c.controller.getAddress())),
      operator: c.operator.address, credits: await c.credits.getAddress(), previousRegistry: ethers.ZeroAddress, legacyMerkleRoot: ethers.ZeroHash,
      settings: { ...c.settings, randomnessBudget: String(c.settings.randomnessBudget), sponsorshipBudget: String(c.settings.sponsorshipBudget) },
      options: choices.map(o => ({ supply: String(o.supply), price: String(o.price), winners: String(o.winners), duration: String(o.duration) })),
      catalog: await Promise.all([0, 1, 2].map(async i => { const p = await c.controller.collectionPlan(i); return { seasonId: p.seasonId, seasonName: p.seasonName, name: p.name, symbol: p.symbol, color: p.color, textColor: p.textColor }; })),
      creditsDeploymentTx: c.credits.deploymentTransaction()!.hash,
    };
    const verified = await verifyDeployment(ethers.provider, expected);
    expect(verified.contracts.length).eq(8);
    expect(verified.preparedCollections).eq(1);
    const mustReject = async (candidate = expected) => { let rejected = false; try { await verifyDeployment(ethers.provider, candidate); } catch { rejected = true; } expect(rejected).eq(true); };
    await mustReject({ ...expected, catalog: expected.catalog.map((p, i) => i === 0 ? { ...p, name: 'Wrong identity' } : p) });
    await mustReject({ ...expected, options: [{}] as any });
    await mustReject({ ...expected, catalog: [{}] as any });
    const d = await ethers.getContractAt('ManekinekoRoundDeployerV12', await c.controller.deployer());
    for (const address of [await d.codePart1(), await c.voting.getAddress(), await c.round.getAddress()]) {
      const code = await ethers.provider.getCode(address);
      await networkHelpers.setCode(address, '0x00');
      await mustReject();
      await networkHelpers.setCode(address, code);
    }
    // A private immutable has no getter: matching executable bytes/getters alone misses this change.
    const deployerArtifact = await compiled('ManekinekoRoundDeployerV12');
    const immutableId = Object.keys(deployerArtifact.immutableReferences).find(id => deployerArtifact.immutableNames[id] === 'firstLength')!;
    const originalDeployer = await ethers.provider.getCode(await d.getAddress());
    const corrupted = ethers.getBytes(originalDeployer);
    for (const ref of deployerArtifact.immutableReferences[immutableId]) corrupted[ref.start + ref.length - 1] ^= 1;
    await networkHelpers.setCode(await d.getAddress(), ethers.hexlify(corrupted));
    await mustReject();
    await networkHelpers.setCode(await d.getAddress(), originalDeployer);
    expect((await verifyDeployment(ethers.provider, expected)).deploymentHash).eq(verified.deploymentHash);
  });
  it("refuses the no-NFT genesis exception when a registry declares historical winners or ancestry", async () => {
    const c = await loadFixture(fixture);
    const prior = await ethers.deployContract("ManekinekoWinnerCreditsV7", [c.operator.address, ethers.ZeroHash, ethers.ZeroAddress]);
    for (const [root, ancestor] of [[ethers.id("historical root"), ethers.ZeroAddress], [ethers.ZeroHash, await prior.getAddress()]]) {
      const credits = await ethers.deployContract("ManekinekoWinnerCreditsV8", [c.operator.address, root, ancestor]);
      await expect(ethers.deployContract("ManekinekoSeasonControllerV12", [{ ...c.settings, credits: await credits.getAddress() }, choices]))
        .revertedWithCustomError(c.controller, "InvalidConfiguration");
      const migration = await ethers.deployContract("ManekinekoSeasonControllerV12", [{ ...c.settings, credits: await credits.getAddress(), bootstrapAllowed: false }, choices]);
      expect((await migration.settings()).bootstrapAllowed).eq(false);
    }
    const importedCredits = await ethers.deployContract("ManekinekoWinnerCreditsV8", [c.operator.address, ethers.ZeroHash, ethers.ZeroAddress]);
    const genesis = await ethers.deployContract("ManekinekoSeasonControllerV12", [{ ...c.settings, credits: await importedCredits.getAddress() }, choices]);
    const deployer = await ethers.deployContract("ManekinekoRoundDeployerV12", [await genesis.getAddress()]);
    await genesis.bindDeployer(await deployer.getAddress());
    for (const factory of [genesis, c.controller]) await importedCredits.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
    await importedCredits.registerCollection(await c.controller.getAddress(), 1);
    await importedCredits.sealFactories();
    await genesis.appendCollections([{ seasonId: ethers.id('Invalid genesis'), seasonName: 'Invalid genesis', name: 'Existing history', symbol: 'HIST', color: '#330000', textColor: '#FFFFFF' }]);
    await expect(genesis.sealCatalog()).revertedWithCustomError(genesis, "InvalidConfiguration");
  });
  it("permanently seals reward factories before launch, including after ownership transfer", async () => {
    const c = await loadFixture(fixture);
    expect(await c.credits.factoriesSealed()).eq(true);
    await expect(c.credits.approveFactory(await c.vrf.getAddress(), ethers.keccak256(await ethers.provider.getCode(await c.vrf.getAddress()))))
      .revertedWithCustomError(c.credits, "FactoriesSealed");
    await expect(c.credits.sealFactories()).revertedWithCustomError(c.credits, "FactoriesSealed");
    await c.credits.transferOwnership(c.other.address);
    await c.credits.connect(c.other).acceptOwnership();
    await expect(c.credits.connect(c.other).approveFactory(await c.vrf.getAddress(), ethers.ZeroHash))
      .revertedWithCustomError(c.credits, "FactoriesSealed");
    // Sealing removes discretionary approvals, not ordinary catalog progression.
    await time.increaseTo(await c.round.mintDeadline());
    await c.controller.prepareNext();
    expect(await c.credits.collectionCount()).eq(2);
  });
  it("reads the deployed protocol directly at one pinned block and fails closed on wrong code", async () => {
    const c = await loadFixture(fixture),
      address = await c.controller.getAddress();
    const config = {
      chainId: 31337,
      controller: address,
      codeHash: ethers.keccak256(await ethers.provider.getCode(address)),
      rpcUrl: "http://127.0.0.1",
    };
    const snapshot = await readProtocol(
      ethers.provider,
      config,
      0,
      c.buyer.address
    );
    expect(snapshot.round?.price).eq(PRICE);
    expect(snapshot.round?.remaining).eq(20);
    expect(snapshot.round?.sponsorship).eq(PRICE * 2n);
    expect(snapshot.canPrepare).eq(false);
    expect(snapshot.round?.canFinalize).eq(false);
    expect(snapshot.round?.operatorRemaining).eq(0);
    const catalog = await readCatalog(ethers.provider, config, snapshot);
    expect(catalog.seasons.flatMap((s) => s.collections).length).eq(3);
    expect(catalog.seasons[0].collections[0].name).eq(snapshot.round?.name);
    expect(await readCatalog(ethers.provider, config, snapshot)).eq(catalog);
    try {
      await readProtocol(ethers.provider, {
        ...config,
        codeHash: ethers.ZeroHash,
      });
      expect.fail("must reject unverified code");
    } catch (e) {
      expect(String(e)).includes("deployment could not be verified");
    }
  });
  it("enforces the 1,000 supply and 0.01 ETH floors, fixed allocations and valid candidate packages", async () => {
    const c = await loadFixture(fixture);
    for (const invalid of [
      { price: PRICE - 1n },
      { supply: 0n },
      { supply: 1n },
      { supply: 999n },
      { supply: 999n, price: PRICE * 10n },
      { supply: 65537n },
      { winners: 7n },
      { winners: 0n },
      { duration: 86401n },
      { duration: 3599n },
    ])
      await expect(
        c.voting.validateTerms({ ...choices[0], ...invalid })
      ).revertedWithCustomError(c.voting, "InvalidTerms");
    expect(await c.voting.MIN_SUPPLY()).eq(1000);
    for (const supply of [1000n, 1001n, 2000n, 65536n])
      await c.voting.validateTerms({ ...choices[0], supply });
    await expect(
      ethers.deployContract("ManekinekoSeasonControllerV12", [
        c.settings,
        [{ ...choices[0], supply: 999n }],
      ])
    ).revertedWithCustomError(c.voting, "InvalidTerms");
    expect(await c.round.prizeBps()).eq(6000);
    expect(await c.round.affiliatePoolBps()).eq(2000);
    expect(await c.round.minAffiliateReferrals()).eq(1);
  });
  it("opens precisely at the vote deadline without a vote, finalizer or owner activation", async () => {
    const c = await loadFixture(fixture);
    await expect(
      c.round.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE })
    ).revertedWithCustomError(c.round, "MintClosed");
    const end = await c.round.saleStartAt(),
      hash = await c.round.termsHash();
    await time.setNextBlockTimestamp(end);
    await c.round
      .connect(c.buyer)
      .mintQuoted(c.buyer.address, 1, 0, hash, { value: PRICE });
    expect(await c.round.saleActivated()).eq(true);
    expect(await c.round.mintDeadline()).eq(end + 3600n);
    await expect(c.controller.prepareNext()).revertedWithCustomError(
      c.controller,
      "SaleStillOpen"
    );
    await expect(c.controller.appendCollections([])).revertedWithCustomError(
      c.controller,
      "CatalogLocked"
    );
  });
  it("pays three qualifiers equal affiliate shares, six equal prizes, and only 20% ordinary operator proceeds", async () => {
    const c = await loadFixture(fixture),
      b = await c.voting.ballots(await c.round.getAddress());
    await time.increaseTo(b.startsAt);
    for (let i = 0; i < 4; i++)
      await c.round
        .connect(c.affiliates[i])
        .enrollAffiliate(i + 1, ethers.ZeroAddress, 0);
    await open(c);
    for (let i = 1; i <= 3; i++)
      await c.round
        .connect(c.buyer)
        .mintWithAffiliate(c.buyer.address, 1, i, { value: PRICE });
    await c.round
      .connect(c.buyer)
      .mint(c.buyer.address, 17, { value: PRICE * 17n });
    await fillRemaining(c);
    expect(await c.round.totalMintRevenue()).eq(ethers.parseEther("10"));
    const pool = POOL,
      share = pool / 3n;
    expect(await c.round.affiliateQualifiedCount()).eq(3);
    expect(await c.round.affiliateEqualShare()).eq(share);
    expect(await c.round.affiliateClaimable(4)).eq(0);
    expect(await c.round.unallocatedAffiliatePool()).eq(pool % 3n);
    await expect(
      c.round.withdrawOperator(c.operator.address, 1)
    ).revertedWithCustomError(c.round, "InsufficientWithdrawableBalance");
    await reveal(c);
    await expect(
      c.round.connect(c.other).withdrawOperator(c.other.address, pool)
    ).revertedWithCustomError(c.round, "NotOperator");
    await expect(
      c.round.withdrawOperator(c.operator.address, pool + 1n)
    ).revertedWithCustomError(c.round, "InsufficientWithdrawableBalance");
    await expect(
      c.round.withdrawOperator(c.operator.address, pool)
    ).changeEtherBalances(ethers, [c.round, c.operator], [-pool, pool]);
    expect(await c.round.operatorWithdrawable()).eq(0);
    for (let rank = 1; rank <= 6; rank++)
      expect(await c.round.prizeAmountForRank(rank)).eq(PRIZE_POOL / 6n);
    await claimAwards(c);
    for (let i = 0; i < 3; i++)
      await c.round
        .connect(c.affiliates[i])
        .claimAffiliateCommission(c.affiliates[i].address);
    if (pool % 3n)
      await c.round.withdrawGrowthReserve(c.operator.address, pool % 3n);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(0);
  });
  it("preserves all unsold receipts for refunds while allowing the next collection", async () => {
    const c = await loadFixture(fixture);
    await open(c);
    await c.round
      .connect(c.buyer)
      .mint(c.buyer.address, 3, { value: PRICE * 3n });
    expect(await c.round.protectedBalance()).eq(PRICE * 3n + EXECUTION);
    await time.increaseTo(await c.round.mintDeadline());
    await next(c);
    expect(await c.round.refundsAvailable()).eq(true);
    await expect(
      c.round.withdrawOperator(c.operator.address, 1)
    ).revertedWithCustomError(c.round, "InsufficientWithdrawableBalance");
    for (let i = 1; i <= 3; i++)
      await expect(
        c.round.connect(c.buyer).refund(i, c.buyer.address)
      ).changeEtherBalances(ethers, [c.round, c.buyer], [-PRICE, PRICE]);
    expect(await c.round.remainingMints(c.buyer.address)).eq(17);
  });
  it("snapshots ownership, prevents transfer double voting and freezes selected terms", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await reveal(c);
    const target = await next(c),
      b = await c.voting.ballots(await target.getAddress());
    await time.increaseTo(b.startsAt);
    await c.round
      .connect(c.buyer)
      .transferFrom(c.buyer.address, c.other.address, await loser(c));
    expect(
      await c.voting.votingPower(
        await target.getAddress(),
        c.buyer.address,
        await c.round.getAddress()
      )
    ).eq(20);
    expect(
      await c.voting.votingPower(
        await target.getAddress(),
        c.other.address,
        await c.round.getAddress()
      )
    ).eq(0);
    await c.voting
      .connect(c.buyer)
      .castVote(await target.getAddress(), 1, [await c.round.getAddress()]);
    await expect(
      c.voting
        .connect(c.buyer)
        .castVote(await target.getAddress(), 0, [await c.round.getAddress()])
    ).revertedWithCustomError(c.voting, "AlreadyVoted");
    await expect(
      c.voting
        .connect(c.other)
        .castVote(await target.getAddress(), 0, [await c.round.getAddress()])
    ).revertedWithCustomError(c.voting, "NotEligible");
    await time.increaseTo(b.endsAt);
    expect(await target.maxSupply()).eq(2000);
    expect(await target.mintPrice()).eq(PRICE * 2n);
    expect(await target.winnerCount()).eq(4);
    await expect(
      c.voting
        .connect(c.buyer)
        .castVote(await target.getAddress(), 0, [await c.round.getAddress()])
    ).revertedWithCustomError(c.voting, "InvalidBallot");
    await expect(
      target
        .connect(c.buyer)
        .mintQuoted(c.buyer.address, 1, 0, ethers.ZeroHash, {
          value: PRICE * 2n,
        })
    ).revertedWithCustomError(target, "TermsChanged");
    await target
      .connect(c.buyer)
      .mint(c.buyer.address, 1, { value: PRICE * 2n });
  });
  it("lets voting double supply at the same price and withdraws 4 ETH as 20% while protecting 16 ETH", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await reveal(c);
    const target = await next(c),
      b = await c.voting.ballots(await target.getAddress());
    await time.increaseTo(b.startsAt);
    await c.voting
      .connect(c.buyer)
      .castVote(await target.getAddress(), 2, [await c.round.getAddress()]);
    const doubled = { ...c, round: target };
    await open(doubled);
    expect(await target.maxSupply()).eq(2000);
    expect(await target.mintPrice()).eq(PRICE);
    await fillRemaining(doubled);
    expect(await target.totalMintRevenue()).eq(ethers.parseEther("20"));
    await reveal(doubled);
    const operatorShare = ethers.parseEther("4");
    expect(await target.operatorWithdrawable()).eq(operatorShare);
    await expect(
      target.withdrawOperator(c.operator.address, operatorShare + 1n)
    ).revertedWithCustomError(target, "InsufficientWithdrawableBalance");
    await expect(
      target.withdrawOperator(c.operator.address, operatorShare)
    ).changeEtherBalances(
      ethers,
      [target, c.operator],
      [-operatorShare, operatorShare]
    );
    expect(await target.operatorWithdrawable()).eq(0);
    expect(await target.protectedBalance()).eq(ethers.parseEther("16"));
    expect(await ethers.provider.getBalance(await target.getAddress())).eq(
      ethers.parseEther("16")
    );
    expect(await target.unallocatedAffiliatePool()).eq(ethers.parseEther("4"));
    for (let rank = 1; rank <= 6; rank++)
      expect(await target.prizeAmountForRank(rank)).eq(ethers.parseEther("2"));
  });
  it("retries a failed VRF request without undoing sellout and forbids rerolls and refunds before the randomness cutoff", async () => {
    const c = await loadFixture(fixture);
    await c.vrf.setRequestFailure(true);
    await sell(c);
    expect(await c.round.soldOut()).eq(true);
    expect(await c.round.randomnessRequested()).eq(false);
    await c.vrf.setRequestFailure(false);
    await c.round.connect(c.other).requestRandomness();
    await expect(c.round.requestRandomness()).revertedWithCustomError(
      c.round,
      "InvalidPhase"
    );
    await expect(
      c.round.rawFulfillRandomWords(await c.round.requestId(), [0])
    ).revertedWithCustomError(c.round, "OnlyCoordinator");
    await time.increaseTo(await c.round.mintDeadline());
    expect(await c.round.refundsAvailable()).eq(false);
    await expect(
      c.round.connect(c.buyer).refund(1, c.buyer.address)
    ).revertedWithCustomError(c.round, "InvalidPhase");
    await reveal(c);
  });
  it("preserves metadata through reveal/claims/transfers and lifetime credits when target preparation precedes a claim", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    const before = await c.round.tokenURI(1);
    await reveal(c);
    const target = await next(c);
    await claimAwards(c);
    const winner = await awardSigner(c, 1);
    expect(await c.round.tokenURI(1)).eq(before);
    await c.round
      .connect(c.buyer)
      .transferFrom(c.buyer.address, c.other.address, 1);
    expect(await c.round.tokenURI(1)).eq(before);
    await time.increaseTo(await target.saleStartAt());
    await c.credits
      .connect(winner)
      .claimAndRedeemAward(
        await c.round.getAddress(),
        1,
        await target.getAddress()
      );
    expect(await target.totalMintRevenue()).eq(PRICE);
    expect(await c.credits.lifetimeRewardUsed(winner.address)).eq(true);
    await time.increaseTo(await target.mintDeadline());
    await target.connect(winner).refund(1, winner.address);
    expect(await c.credits.lifetimeRewardUsed(winner.address)).eq(true);
  });
  it("continues into the next season without consuming old unclaimed prizes", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await reveal(c);
    const second = await next(c);
    await time.increaseTo(await second.mintDeadline());
    const third = await next(c);
    expect(await third.seasonId()).eq(ethers.id("Second season"));
    expect(await c.round.claimedAwardCount()).eq(0);
    expect(await c.round.protectedBalance()).eq(REVENUE - POOL);
  });
  it("cannot stop a live collection or remove its randomness funds, and rejects late/reused affiliate eligibility", async () => {
    const c = await loadFixture(fixture);
    await open(c);
    await c.round.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE });
    await expect(c.round.cancelExpiredRound()).revertedWithCustomError(
      c.round,
      "InvalidPhase"
    );
    await expect(
      c.round.withdrawRandomnessFunding(c.operator.address)
    ).revertedWithCustomError(c.round, "InvalidPhase");
    for (const fn of [
      "activateSale",
      "pause",
      "unpause",
      "upgradeTo",
      "transferOwnership",
      "setDeadline",
      "setMintPrice",
      "setCoordinator",
    ])
      expect(c.round.interface.hasFunction(fn)).eq(false);
    await c.round
      .connect(c.buyer)
      .mint(c.buyer.address, 19, { value: PRICE * 19n });
    expect(await c.round.remainingMints(c.buyer.address)).eq(0);
    await fillRemaining(c);
    await reveal(c);
    const target = await next(c);
    const b = await c.voting.ballots(await target.getAddress());
    await time.increaseTo(b.startsAt);
    const id = await loser(c);
    await target
      .connect(c.buyer)
      .enrollAffiliate(1, await c.round.getAddress(), id);
    await c.round
      .connect(c.buyer)
      .transferFrom(c.buyer.address, c.other.address, id);
    await expect(
      target.connect(c.other).enrollAffiliate(2, await c.round.getAddress(), id)
    ).revertedWithCustomError(c.voting, "NotEligible");
    await time.increaseTo(b.endsAt);
    await expect(
      target.connect(c.other).enrollAffiliate(2, await c.round.getAddress(), id)
    ).revertedWithCustomError(target, "EnrollmentClosed");
  });
  it("does not let early preparation exclude the previous collection from its snapshot", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await expect(c.controller.prepareNext()).revertedWithCustomError(
      c.controller,
      "SaleStillOpen"
    );
    await reveal(c);
    await next(c);
  });
  it("breaks tied votes by option order and never restores used source power", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await reveal(c);
    await claimAwards(c);
    for (let id = 1; id <= 10; id++)
      await c.round
        .connect(c.buyer)
        .transferFrom(c.buyer.address, c.other.address, id);
    const target = await next(c),
      b = await c.voting.ballots(await target.getAddress());
    await time.increaseTo(b.startsAt);
    await c.voting
      .connect(c.buyer)
      .castVote(await target.getAddress(), 1, [await c.round.getAddress()]);
    await c.voting
      .connect(c.other)
      .castVote(await target.getAddress(), 0, [await c.round.getAddress()]);
    expect(await c.voting.winningOption(await target.getAddress())).eq(0);
    expect(
      await c.voting.votingPower(
        await target.getAddress(),
        c.buyer.address,
        await c.round.getAddress()
      )
    ).eq(0);
  });
  it("locks committed sponsorship until the sale ends and preserves full reserve with zero qualifiers", async () => {
    const c = await loadFixture(fixture);
    await expect(
      c.credits.withdrawSponsorship(
        await c.round.getAddress(),
        c.operator.address,
        1
      )
    ).revertedWithCustomError(c.credits, "MintUnavailable");
    await sell(c);
    expect(await c.round.unallocatedAffiliatePool()).eq(POOL);
    await c.credits.withdrawSponsorship(
      await c.round.getAddress(),
      c.operator.address,
      PRICE * 2n
    );
    await reveal(c);
    await c.round.withdrawOperator(c.operator.address, POOL);
    await c.round.withdrawGrowthReserve(c.operator.address, POOL);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(
      PRIZE_POOL
    );
  });
  it("escrows imported NFTs before a snapshot and prevents withdrawal/transfer double votes", async () => {
    const c = await loadFixture(importFixture);
    await sell(c);
    await reveal(c);
    const controller = c.importedController!;
    const deployer = await ethers.deployContract("ManekinekoRoundDeployerV12", [
      await controller.getAddress(),
    ]);
    await controller.bindDeployer(await deployer.getAddress());
    await controller.appendCollections([
      {
        seasonId: ethers.id("Imported test"),
        seasonName: "Imported test",
        name: "Imported one",
        symbol: "IMPT",
        color: "#330000",
        textColor: "#FFFFFF",
      },
    ]);
    await controller.importVotingSource(await c.round.getAddress());
    await controller.sealCatalog();
    await c.operator.sendTransaction({
      to: await controller.getAddress(),
      value: ethers.parseEther("1"),
    });
    await controller.prepareNext();
    const voting = await ethers.getContractAt(
        "ManekinekoVotingV12",
        await controller.voting()
      ),
      target = await controller.rounds(1),
      id = await loser(c);
    await c.round.connect(c.buyer).approve(await voting.getAddress(), id);
    await voting
      .connect(c.buyer)
      .depositLegacy(await c.round.getAddress(), [id]);
    const b = await voting.ballots(target);
    await time.increaseTo(b.startsAt);
    await voting
      .connect(c.buyer)
      .withdrawLegacy(await c.round.getAddress(), [id]);
    await c.round
      .connect(c.buyer)
      .transferFrom(c.buyer.address, c.other.address, id);
    await c.round.connect(c.other).approve(await voting.getAddress(), id);
    await voting
      .connect(c.other)
      .depositLegacy(await c.round.getAddress(), [id]);
    expect(
      await voting.votingPower(
        target,
        c.buyer.address,
        await c.round.getAddress()
      )
    ).eq(1);
    expect(
      await voting.votingPower(
        target,
        c.other.address,
        await c.round.getAddress()
      )
    ).eq(0);
    await voting
      .connect(c.buyer)
      .castVote(target, 1, [await c.round.getAddress()]);
    await expect(
      voting.connect(c.other).castVote(target, 0, [await c.round.getAddress()])
    ).revertedWithCustomError(voting, "NotEligible");
    await voting
      .connect(c.other)
      .withdrawLegacy(await c.round.getAddress(), [id]);
    expect(await c.round.ownerOf(id)).eq(c.other.address);
  });
  it("atomically finalizes the unchanged draw, pays exactly 20 percent and opens the next ballot", async () => {
    const c = await loadFixture(fixture);
    await time.increaseTo((await c.voting.ballots(await c.round.getAddress())).startsAt);
    for (let i = 0; i < 3; i++) await c.round.connect(c.affiliates[i]).enrollAffiliate(i + 1, ethers.ZeroAddress, 0);
    await open(c);
    for (let i = 1; i <= 3; i++) await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, i, { value: PRICE });
    await c.round.connect(c.buyer).mint(c.buyer.address, 17, { value: PRICE * 17n });
    await fillRemaining(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    expect(await c.round.canFinalizeDraw()).eq(true);
    const checkpoint = await networkHelpers.takeSnapshot();
    await c.round.connect(c.other).finalizeDraw(8);
    const expected = await Promise.all(Array.from({ length: 6 }, (_, i) => c.round.winningTokenIds(i + 1)));
    await checkpoint.restore();
    const metadata = await c.round.tokenURI(1);
    const walletBefore = await ethers.provider.getBalance(c.operator.address);
    const receipt = await (await c.controller.settleAndPrepare(1, POOL)).wait();
    expect(await ethers.provider.getBalance(c.operator.address)).eq(walletBefore + POOL + EXECUTION - receipt!.fee);
    expect(await c.round.operatorWithdrawn()).eq(POOL);
    expect(await c.round.operatorWithdrawable()).eq(0);
    for (let i = 1; i <= 3; i++) expect(await c.round.affiliateClaimable(i)).eq(POOL / 3n);
    expect(await c.round.protectedBalance()).eq(REVENUE - POOL);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(REVENUE - POOL);
    expect(await c.round.tokenURI(1)).eq(metadata);
    expect(await Promise.all(Array.from({ length: 6 }, (_, i) => c.round.winningTokenIds(i + 1)))).deep.eq(expected);
    expect(await c.controller.roundCount()).eq(2);
    const following = await c.controller.rounds(2), ballot = await c.voting.ballots(following);
    expect(ballot.startsAt).eq(BigInt((await time.latest()) + c.settings.votingDelay));
    await time.increaseTo(ballot.startsAt);
    expect(await c.voting.votingPower(following, c.buyer.address, await c.round.getAddress())).eq(20);
    await claimAwards(c);
    await expect(c.controller.settleAndPrepare(1, POOL)).revertedWithCustomError(c.controller, "CollectionChanged");
  });
  it("does not confuse the mint deadline with the later randomness deadline", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await time.increaseTo((await c.round.mintDeadline()) + 86400n);
    expect(await c.round.refundsAvailable()).eq(false);
    await expect(c.round.connect(c.buyer).refund(1, c.buyer.address)).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.controller.settleAndPrepare(1, POOL)).revertedWithCustomError(c.round, "InvalidPhase");
    expect(await c.round.operatorWithdrawn()).eq(0);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    await c.controller.settleAndPrepare(1, POOL);
    expect(await c.round.refundsAvailable()).eq(false);
    expect(await c.round.revealed()).eq(true);
  });
  it("rejects unauthorized batches, live-sale settlement and changed proceeds without side effects", async () => {
    const c = await loadFixture(fixture);
    await expect(c.controller.connect(c.other).settleAndPrepare(1, 0)).revertedWithCustomError(c.controller, "Unauthorized");
    await expect(c.round.connect(c.other).withdrawOperatorToOperator()).revertedWithCustomError(c.round, "NotOperator");
    await expect(c.controller.settleAndPrepare(1, 0)).revertedWithCustomError(c.controller, "SaleStillOpen");
    await sell(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    await expect(c.controller.settleAndPrepare(1, POOL + 1n)).revertedWithCustomError(c.controller, "OperatorProceedsChanged");
    expect(await c.round.revealed()).eq(false);
    expect(await c.round.drawCounter()).eq(0);
    expect(await c.round.operatorWithdrawn()).eq(0);
    expect(await c.controller.roundCount()).eq(1);
  });
  it("includes only the exact operating shortfall in the same transaction while paying the full operator share", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    const address = await c.controller.getAddress(), cost = await c.controller.preparationCost();
    await networkHelpers.setBalance(address, 0);
    await expect(c.controller.settleAndPrepare(1, POOL)).revertedWithCustomError(c.controller, "InvalidOperatingTopUp");
    await expect(c.controller.settleAndPrepare(1, POOL, { value: cost + 1n })).revertedWithCustomError(c.controller, "InvalidOperatingTopUp");
    expect(await c.round.revealed()).eq(false);
    const before = await ethers.provider.getBalance(c.operator.address);
    const receipt = await (await c.controller.settleAndPrepare(1, POOL, { value: cost })).wait();
    expect(await ethers.provider.getBalance(c.operator.address)).eq(before + POOL + EXECUTION - cost - receipt!.fee);
    expect(await c.round.operatorWithdrawn()).eq(POOL);
    expect(await ethers.provider.getBalance(address)).eq(0);
    expect(await c.controller.roundCount()).eq(2);
  });
  it("rolls finalization and payout back if preparing the next collection fails", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    // The next round's subscription creation now fails after the earlier batch steps.
    await networkHelpers.setCode(await c.vrf.getAddress(), "0x60006000fd");
    await expect(c.controller.settleAndPrepare(1, POOL)).revert(ethers);
    expect(await c.round.revealed()).eq(false);
    expect(await c.round.drawCounter()).eq(0);
    expect(await c.round.operatorWithdrawn()).eq(0);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(REVENUE + EXECUTION);
    expect(await c.controller.roundCount()).eq(1);
  });
  it("preserves permissionless progress when a bounded draw batch cannot yet finalize", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    const renderer = await c.round.renderer(), original = await ethers.provider.getCode(renderer);
    const reject = await artifacts.readArtifact("RejectingDrawRendererV12");
    await networkHelpers.setCode(renderer, reject.deployedBytecode);
    expect(await c.round.canFinalizeDraw()).eq(false);
    await expect(c.controller.settleAndPrepare(1, POOL)).revertedWithCustomError(c.controller, "DrawNeedsProgress");
    expect(await c.round.drawCounter()).eq(0);
    await c.round.connect(c.other).finalizeDraw(8);
    expect(await c.round.drawCounter()).eq(8);
    await networkHelpers.setCode(renderer, original);
    expect(await c.round.canFinalizeDraw()).eq(true);
    await c.controller.settleAndPrepare(1, POOL);
    expect(await c.round.drawCounter()).greaterThan(8n);
    expect(await c.controller.roundCount()).eq(2);
  });
  it("handles an already finalized partial withdrawal and the final catalog collection without double payment", async () => {
    const c = await loadFixture(fixture);
    // First two collections expire; the same permissionless payable preparation crosses the season boundary.
    await time.increaseTo(await c.round.mintDeadline());
    await c.controller.settleAndPrepare(1, 0);
    const second = await ethers.getContractAt("ManekinekoRoundV12", await c.controller.rounds(2));
    await time.increaseTo(await second.mintDeadline());
    await networkHelpers.setBalance(await c.controller.getAddress(), 0);
    await c.controller.connect(c.other).prepareNext({ value: await c.controller.preparationCost() });
    const last = await ethers.getContractAt("ManekinekoRoundV12", await c.controller.rounds(3));
    expect(await last.seasonName()).eq("Second season");
    const lastContext = { ...c, round: last };
    await sell(lastContext);
    await reveal(lastContext);
    await last.withdrawOperator(c.operator.address, POOL / 2n);
    await expect(c.controller.settleAndPrepare(3, POOL)).revertedWithCustomError(c.controller, "OperatorProceedsChanged");
    await expect(c.controller.settleAndPrepare(3, POOL / 2n)).emit(c.controller, "CollectionSettled").withArgs(3, await last.getAddress(), POOL / 2n, ethers.ZeroAddress);
    expect(await last.operatorWithdrawn()).eq(POOL);
    expect(await c.controller.roundCount()).eq(3);
    await expect(c.controller.settleAndPrepare(3, POOL / 2n)).revertedWithCustomError(c.controller, "OperatorProceedsChanged");
  });
  it("prefunds an executor separately and protects every mint wei until finalization", async () => {
    const c = await loadFixture(fixture);
    expect(await c.controller.preparationCost()).eq(c.settings.randomnessBudget + c.settings.sponsorshipBudget + EXECUTION);
    expect(await c.round.executionReserve()).eq(EXECUTION);
    expect(await c.round.randomnessDeadline()).eq(0);
    await time.increaseTo((await c.voting.ballots(await c.round.getAddress())).startsAt);
    await c.round.connect(c.affiliates[0]).enrollAffiliate(1, ethers.ZeroAddress, 0);
    await open(c);
    await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, {value: PRICE});
    await fillRemaining(c);
    expect(await c.round.randomnessDeadline()).eq((await c.round.soldOutAt()) + 72n * 3600n);
    expect(await c.round.affiliateAccrued(1)).eq(POOL);
    expect(await c.round.affiliateClaimable(1)).eq(0);
    expect(await c.round.protectedBalance()).eq(REVENUE + EXECUTION);
    await expect(c.round.connect(c.affiliates[0]).claimAffiliateCommission(c.affiliates[0].address)).revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
    await expect(c.round.recoverExecutionFunding()).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.round.withdrawGrowthReserve(c.operator.address, 1)).revertedWithCustomError(c.round, "InsufficientWithdrawableBalance");
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    expect(await c.round.affiliateClaimable(1)).eq(0);
    await expect(c.round.connect(c.other).finalizeDrawAndClaim(c.other.address))
      .changeEtherBalances(ethers, [c.round, c.other], [-EXECUTION, EXECUTION]);
    expect(await c.round.executionRecipient()).eq(c.other.address);
    expect(await c.round.executionReserve()).eq(0);
    expect(await c.round.affiliateClaimable(1)).eq(POOL);
    expect(await c.round.operatorWithdrawable()).eq(POOL);
    expect(await c.round.protectedBalance()).eq(REVENUE - POOL);
    await expect(c.round.connect(c.other).claimExecutionReward(c.other.address)).revertedWithCustomError(c.round, "InvalidPhase");
  });
  it("records entropy one second before cutoff irrevocably, even if the operator never returns", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    const cutoff = await c.round.randomnessDeadline();
    await time.setNextBlockTimestamp(cutoff - 1n);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    expect(await c.round.randomnessReceived()).eq(true);
    await time.increaseTo(cutoff + 365n * 86400n);
    expect(await c.round.refundsAvailable()).eq(false);
    await expect(c.round.cancelExpiredRound()).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.round.connect(c.buyer).refund(1, c.buyer.address)).revertedWithCustomError(c.round, "InvalidPhase");
    await c.round.connect(c.other).finalizeDrawAndClaim(c.other.address);
    await claimAwards(c);
    await next(c);
    expect(await c.round.operatorWithdrawn()).eq(0);
    expect(await c.controller.roundCount()).eq(2);
  });
  it("at the exact cutoff ignores late entropy before any refund transaction and fully backs every ticket", async () => {
    const c = await loadFixture(fixture);
    await time.increaseTo((await c.voting.ballots(await c.round.getAddress())).startsAt);
    await c.round.connect(c.affiliates[0]).enrollAffiliate(1, ethers.ZeroAddress, 0);
    await open(c);
    await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE });
    await fillRemaining(c);
    const cutoff = await c.round.randomnessDeadline();
    await time.increaseTo(cutoff - 1n);
    expect(await c.round.refundsAvailable()).eq(false);
    await time.setNextBlockTimestamp(cutoff);
    await expect(c.vrf.fulfillRequest(await c.round.requestId(), 123)).emit(c.round, "LateRandomnessIgnored");
    expect(await c.vrf.lastCallbackSucceeded()).eq(true);
    expect(await c.round.randomnessReceived()).eq(false);
    expect(await c.round.randomWord()).eq(0);
    expect(await c.round.refundsAvailable()).eq(true);
    expect(await c.round.operatorAllocation()).eq(0);
    expect(await c.round.affiliateClaimable(1)).eq(0);
    await expect(c.round.finalizeDraw(8)).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.round.requestRandomness()).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.round.connect(c.affiliates[0]).claimAffiliateCommission(c.affiliates[0].address)).revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
    await c.round.recoverExecutionFunding();
    expect(await c.round.protectedBalance()).eq(REVENUE);
    // The failed collection never contributes voting weight to the next ballot.
    await c.controller.settleAndPrepare(1, 0);
    const target = await c.controller.rounds(2), ballot = await c.voting.ballots(target);
    await time.increaseTo(ballot.startsAt);
    expect(await c.voting.votingPower(target, c.buyer.address, await c.round.getAddress())).eq(0);
    await c.round.connect(c.buyer).transferFrom(c.buyer.address, c.other.address, 1);
    await expect(c.round.connect(c.other).refund(1, c.other.address)).changeEtherBalances(ethers, [c.round, c.other], [-PRICE, PRICE]);
    for (let token = 2; token <= 1000; token++) {
      const owner = await c.round.ownerOf(token);
      const signer = await ethers.getImpersonatedSigner(owner);
      await networkHelpers.setBalance(owner, ethers.parseEther("1"));
      await c.round.connect(signer).refund(token, owner);
    }
    expect(await c.round.totalRefunded()).eq(REVENUE);
    expect(await c.round.totalSupply()).eq(0);
    expect(await c.round.protectedBalance()).eq(0);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).eq(0);
  });
  it("a never-accepted request expires from sellout without retries extending the deadline", async () => {
    const c = await loadFixture(fixture);
    await c.vrf.setRequestFailure(true);
    await sell(c);
    const cutoff = await c.round.randomnessDeadline();
    await time.increaseTo(cutoff - 10n);
    await expect(c.round.connect(c.other).requestRandomness()).revertedWithCustomError(c.vrf, "InjectedRequestFailure");
    expect(await c.round.randomnessDeadline()).eq(cutoff);
    await time.increaseTo(cutoff);
    await c.vrf.setRequestFailure(false);
    await expect(c.round.requestRandomness()).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.round.fundRandomness({value: 1})).revertedWithCustomError(c.round, "InvalidFunding");
    await c.round.connect(c.buyer).refund(1, c.buyer.address);
    await c.controller.connect(c.other).prepareNext();
    expect(await c.round.randomnessReceived()).eq(false);
  });
  it("late delivery after refunds cannot revive the round and pending VRF fees cannot block refunds or rollover", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await time.increaseTo(await c.round.randomnessDeadline());
    await expect(c.round.withdrawRandomnessFunding(c.operator.address)).revertedWithCustomError(c.vrf, "PendingRequest");
    expect(await c.round.subscriptionClosed()).eq(false);
    await c.round.connect(c.buyer).refund(1, c.buyer.address);
    await c.controller.settleAndPrepare(1, 0);
    await c.vrf.fulfillRequest(await c.round.requestId(), 456);
    expect(await c.vrf.lastCallbackSucceeded()).eq(true);
    expect(await c.round.randomnessReceived()).eq(false);
    expect(await c.round.refundsAvailable()).eq(true);
    await c.round.withdrawRandomnessFunding(c.operator.address);
    expect(await c.round.protectedBalance()).eq(REVENUE - PRICE + EXECUTION);
  });
  it("executor reward remains reserved, cannot be stolen, and progress pays only the eventual finalizer", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await c.round.connect(c.buyer).fundExecution({value: EXECUTION});
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    const renderer = await c.round.renderer(), original = await ethers.provider.getCode(renderer);
    const reject = await artifacts.readArtifact("RejectingDrawRendererV12");
    await networkHelpers.setCode(renderer, reject.deployedBytecode);
    await c.round.connect(c.buyer).finalizeDrawAndClaim(c.buyer.address);
    expect(await c.round.drawCounter()).eq(8);
    expect(await c.round.executionRecipient()).eq(ethers.ZeroAddress);
    expect(await c.round.executionReserve()).eq(EXECUTION * 2n);
    await networkHelpers.setCode(renderer, original);
    await c.round.connect(c.other).finalizeDraw(8);
    await expect(c.round.connect(c.buyer).claimExecutionReward(c.buyer.address)).revertedWithCustomError(c.round, "InvalidPhase");
    await c.round.withdrawOperator(c.operator.address, POOL);
    expect(await c.round.protectedBalance()).eq(REVENUE - POOL + EXECUTION * 2n);
    await expect(c.round.connect(c.other).claimExecutionReward(c.other.address)).changeEtherBalances(ethers, [c.round, c.other], [-EXECUTION * 2n, EXECUTION * 2n]);
    await expect(c.round.recoverExecutionFunding()).revertedWithCustomError(c.round, "InvalidPhase");
    await expect(c.round.fundExecution({value: 1})).revertedWithCustomError(c.round, "InvalidFunding");
  });
  it("executor recovers requests, persists bounded progress costs, and waits for canonical finality", async () => {
    const c = await loadFixture(fixture);
    await c.vrf.setRequestFailure(true);
    await sell(c);
    const executor = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, ethers.provider);
    await networkHelpers.setBalance(executor.address, ethers.parseEther("1"));
    const config = { chainId: 31337, controller: await c.controller.getAddress(), codeHash: ethers.keccak256(await ethers.provider.getCode(await c.controller.getAddress())), maxFeePerGas: ethers.parseUnits("100", "gwei"), maxSubsidyPerRound: ethers.parseEther('0.01') };
    const directory = await mkdtemp(join(tmpdir(), 'tincta-funded-executor-')), journal = join(directory, 'intent.json');
    const roundAddress = (await c.round.getAddress()).toLowerCase();
    try {
      expect((await executeOnce(ethers.provider, { ...config, maxSubsidyPerRound: 0n }, executor, journal)).status).eq('request-recovery-needs-budget');
      const rpcProvider = new Proxy(ethers.provider, { get(target, property) {
        if (property === 'estimateGas') return async (tx: any) => { try { return await target.estimateGas(tx); } catch { throw Object.assign(new Error('EVM simulation reverted'), { code: 'CALL_EXCEPTION' }); } };
        const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
      } });
      expect((await executeOnce(rpcProvider, config, executor, journal)).status).eq('vrf-recovery-unavailable');
      await c.vrf.setRequestFailure(false);
      const submitted = await executeOnce(ethers.provider, config, executor, journal);
      expect(submitted.status).eq('submitted');
      const receipt = await ethers.provider.getTransactionReceipt(submitted.hash!);
      const laggingProvider = new Proxy(ethers.provider, { get(target, property) {
        if (property === 'getBlock') return async (tag: any) => target.getBlock(tag === 'finalized' ? receipt!.blockNumber - 1 : tag);
        const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
      } });
      expect((await executeOnce(laggingProvider, config, executor, journal)).status).eq('confirming');
      expect(JSON.parse(await readFile(journal, 'utf8')).hash).eq(submitted.hash);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      const ledger1 = JSON.parse(await readFile(`${journal}.ledger.json`, 'utf8'));
      const spent = BigInt(ledger1.spent[roundAddress]);
      expect(spent).greaterThan(0n);
      await c.vrf.fulfillRequest(await c.round.requestId(), 0);
      const renderer = await c.round.renderer(), original = await ethers.provider.getCode(renderer);
      const reject = await artifacts.readArtifact('RejectingDrawRendererV12');
      await networkHelpers.setCode(renderer, reject.deployedBytecode);
      expect((await executeOnce(ethers.provider, { ...config, maxSubsidyPerRound: spent }, executor, journal)).status).eq('budget-limit');
      expect(await ethers.provider.getTransactionCount(executor.address)).eq(1);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('submitted');
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      expect(await c.round.drawCounter()).eq(8);
      const ledger2 = JSON.parse(await readFile(`${journal}.ledger.json`, 'utf8'));
      expect(BigInt(ledger2.spent[roundAddress])).greaterThan(spent);
      await networkHelpers.setCode(renderer, original);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('submitted');
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      expect(await c.round.revealed()).eq(true);
      expect(await c.round.operatorWithdrawn()).eq(0);
      const finalLedger = JSON.parse(await readFile(`${journal}.ledger.json`, 'utf8'));
      expect(Object.keys(finalLedger.receipts).length).eq(3);
      expect(BigInt(finalLedger.spent[roundAddress])).at.most(config.maxSubsidyPerRound);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('idle');
      expect(await readFile(`${journal}.ledger.json`, 'utf8')).eq(JSON.stringify(finalLedger) + '\n');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("executor funds VRF within its separate budget, never replaces an accepted request and charges recovery once", async () => {
    const c = await loadFixture(fixture);
    await c.vrf.setRequestFailure(true);
    await sell(c);
    const deadline = await c.round.randomnessDeadline(), subId = await c.round.subscriptionId();
    const executor = new ethers.Wallet(ethers.Wallet.createRandom().privateKey);
    await networkHelpers.setBalance(executor.address, ethers.parseEther('1'));
    const config = { chainId: 31337, controller: await c.controller.getAddress(), codeHash: ethers.keccak256(await ethers.provider.getCode(await c.controller.getAddress())), maxFeePerGas: ethers.parseUnits('100', 'gwei'), maxSubsidyPerRound: ethers.parseEther('0.03'), vrfFundingTarget: ethers.parseEther('0.02') };
    const directory = await mkdtemp(join(tmpdir(), 'tincta-vrf-budget-')), journal = join(directory, 'intent.json');
    const address = (await c.round.getAddress()).toLowerCase();
    const principal = await ethers.provider.getBalance(address);
    try {
      const expensive = new Proxy(ethers.provider, { get(target, property) {
        if (property === 'getFeeData') return async () => ({ maxFeePerGas: ethers.parseUnits('10000', 'gwei'), maxPriorityFeePerGas: 0n });
        const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
      } });
      expect((await executeOnce(expensive, { ...config, maxFeePerGas: ethers.parseUnits('10000', 'gwei') }, executor, journal)).status).eq('budget-limit');
      expect(await ethers.provider.getTransactionCount(executor.address)).eq(0);
      const funding = await executeOnce(ethers.provider, config, executor, journal);
      expect(funding.status).eq('submitted');
      const saved = await readFile(journal, 'utf8');
      const tx = ethers.Transaction.from(JSON.parse(saved).raw);
      expect(tx.data).eq(c.round.interface.encodeFunctionData('fundRandomness'));
      expect(tx.value).eq(ethers.parseEther('0.01'));
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      const receipt = (await ethers.provider.getTransactionReceipt(funding.hash!))!;
      const ledger = JSON.parse(await readFile(`${journal}.ledger.json`, 'utf8'));
      expect(BigInt(ledger.spent[address])).eq(tx.value + receipt.gasUsed * receipt.gasPrice);
      await writeFile(journal, saved); // Crash after ledger persistence but before intent removal.
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      expect(await readFile(`${journal}.ledger.json`, 'utf8')).eq(JSON.stringify(ledger) + '\n');
      expect((await c.vrf.getSubscription(subId)).nativeBalance).eq(config.vrfFundingTarget);
      expect(await c.round.requestId()).eq(0);
      await c.vrf.setRequestFailure(false);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('submitted');
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      const request = await c.round.requestId();
      expect(request).not.eq(0);
      const increasedTarget = { ...config, vrfFundingTarget: ethers.parseEther('0.025') };
      expect((await executeOnce(ethers.provider, increasedTarget, executor, journal)).status).eq('submitted');
      expect((await executeOnce(ethers.provider, increasedTarget, executor, journal)).status).eq('confirmed');
      expect((await c.vrf.getSubscription(subId)).nativeBalance).eq(increasedTarget.vrfFundingTarget);
      expect(await c.round.requestId()).eq(request);
      expect(await c.vrf.nextRequestId()).eq(request + 1n);
      expect(await c.round.randomnessDeadline()).eq(deadline);
      expect(await ethers.provider.getBalance(address)).eq(principal);
      expect(await c.round.operatorWithdrawn()).eq(0);
      expect((await executeOnce(ethers.provider, increasedTarget, executor, journal)).status).eq('idle');
      await time.increaseTo(deadline);
      expect((await executeOnce(ethers.provider, { ...config, vrfFundingTarget: ethers.parseEther('0.03') }, executor, journal)).status).eq('idle');
      expect(await c.round.refundsAvailable()).eq(true);
      expect(BigInt(JSON.parse(await readFile(`${journal}.ledger.json`, 'utf8')).spent[address])).lessThan(config.maxSubsidyPerRound);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("executor survives a competing finalizer before simulation without creating an intent", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    const executor = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, ethers.provider);
    await networkHelpers.setBalance(executor.address, ethers.parseEther("1"));
    const config = { chainId: 31337, controller: await c.controller.getAddress(), codeHash: ethers.keccak256(await ethers.provider.getCode(await c.controller.getAddress())), maxFeePerGas: ethers.parseUnits("100", "gwei"), maxSubsidyPerRound: ethers.parseEther("0.01") };
    const directory = await mkdtemp(join(tmpdir(), 'tincta-executor-race-')), journal = join(directory, 'intent.json');
    const racingProvider = new Proxy(ethers.provider, { get(target, property) {
      if (property === 'estimateGas') return async () => {
        await c.round.connect(c.other).finalizeDrawAndClaim(c.other.address);
        throw Object.assign(new Error('Already finalized'), { code: 'CALL_EXCEPTION' });
      };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
    try {
      expect((await executeOnce(racingProvider, config, executor, journal)).status).eq('already-finalized');
      expect(await ethers.provider.getTransactionCount(executor.address)).eq(0);
      let missing = false;
      try { await readFile(journal); } catch (error) { missing = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
      expect(missing).eq(true);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('idle');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("an independent executor recovers an uncertain send with the same signed transaction and no operator key", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    const executor = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, ethers.provider);
    await networkHelpers.setBalance(executor.address, ethers.parseEther("1"));
    const config = { chainId: 31337, controller: await c.controller.getAddress(), codeHash: ethers.keccak256(await ethers.provider.getCode(await c.controller.getAddress())), maxFeePerGas: ethers.parseUnits("100", "gwei"), maxSubsidyPerRound: ethers.parseEther("0.01") };
    const directory = await mkdtemp(join(tmpdir(), 'tincta-executor-')), journal = join(directory, 'intent.json');
    try {
      expect((await executeOnce(ethers.provider, config, null, journal)).status).eq('ready');
      expect((await executeOnce(ethers.provider, { ...config, maxSubsidyPerRound: 1n }, executor, journal)).status).eq('budget-limit');
      expect(await ethers.provider.getTransactionCount(executor.address)).eq(0);
      let refused = false;
      try { await executeOnce(ethers.provider, { ...config, codeHash: ethers.ZeroHash }, executor, journal); }
      catch { refused = true; }
      expect(refused).eq(true);
      const failingProvider = new Proxy(ethers.provider, { get(target, property) {
        if (property === 'broadcastTransaction') return async () => { throw new Error('Connection lost before response'); };
        const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
      } });
      let failed = false;
      try { await executeOnce(failingProvider, config, executor, journal); } catch { failed = true; }
      expect(failed).eq(true);
      const intent = JSON.parse(await readFile(journal, 'utf8'));
      expect(await c.round.revealed()).eq(false);
      const recovered = await executeOnce(ethers.provider, config, executor, journal);
      expect(recovered.status).eq('submitted');
      expect(recovered.hash).eq(intent.hash);
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('confirmed');
      expect((await executeOnce(ethers.provider, config, executor, journal)).status).eq('idle');
      expect(await c.round.executionRecipient()).eq(executor.address);
      expect(await c.round.executionReserve()).eq(0);
      expect(await c.round.operatorWithdrawn()).eq(0);
      expect(await ethers.provider.getTransactionCount(executor.address)).eq(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("failed VRF delivery still unlocks full refunds and never authorizes replacement randomness", async () => {
    const c = await loadFixture(fixture);
    await sell(c);
    const address = await c.round.getAddress(), original = await ethers.provider.getCode(address), request = await c.round.requestId();
    // Models the coordinator consuming a request even if its delivery callback fails.
    await networkHelpers.setCode(address, '0x60006000fd');
    await c.vrf.fulfillRequest(request, 0);
    await networkHelpers.setCode(address, original);
    expect(await c.vrf.lastCallbackSucceeded()).eq(false);
    expect(await c.round.randomnessReceived()).eq(false);
    await expect(c.round.requestRandomness()).revertedWithCustomError(c.round, 'InvalidPhase');
    await time.increaseTo(await c.round.randomnessDeadline());
    await c.round.connect(c.buyer).refund(1, c.buyer.address);
    expect(await c.round.totalRefunded()).eq(PRICE);
  });
  it("fits Ethereum runtime and initcode size limits", async () => {
    for (const name of [
      "ManekinekoRoundV12",
      "ManekinekoRoundDeployerV12",
      "ManekinekoVotingV12",
      "ManekinekoSeasonControllerV12",
      "ManekinekoWinnerCreditsV8",
    ]) {
      const a = await artifacts.readArtifact(name);
      expect((a.deployedBytecode.length - 2) / 2, name).at.most(24576);
      expect((a.bytecode.length - 2) / 2, name).at.most(49152);
    }
  });
});
