import { expect } from "chai";
import { artifacts, network } from "hardhat";
import { ETHEREUM_VRF } from "../scripts/v2-config.js";

describe("V2 Ethereum network binding (simulated chains, no live VRF proof)", function () {
  for (const chainId of [1, 11155111] as const) {
    it(`pins coordinator and lane on simulated chain ${chainId}, including valid zero request IDs`, async function () {
      const connection = await network.create({ network: "hardhatMainnet", override: { chainId } });
      const { ethers, networkHelpers } = connection;
      try {
        const [owner] = await ethers.getSigners();
        const official = ETHEREUM_VRF[String(chainId) as keyof typeof ETHEREUM_VRF];
        const mockArtifact = await artifacts.readArtifact("VRFCoordinatorV2Mock");
        // This is an in-memory test stub at the pinned address, not a test of an actual Chainlink deployment.
        await networkHelpers.setCode(official.coordinator, mockArtifact.deployedBytecode);
        const coordinator = await ethers.getContractAt("VRFCoordinatorV2Mock", official.coordinator);
        const alternative = await ethers.deployContract("VRFCoordinatorV2Mock");
        const config = {
          name: "Network binding", symbol: "TEST", roundId: 1n, maxSupply: 1n, mintPrice: 100n,
          mintDeadline: BigInt(await networkHelpers.time.latest()) + 86400n, initialOwner: owner.address,
          vrfCoordinator: official.coordinator, keyHash: official.keyHash, requestConfirmations: 64, callbackGasLimit: 200000,
        };
        const factory = await ethers.getContractFactory("ManekinekoRoundV2");
        await expect(factory.deploy({ ...config, vrfCoordinator: await alternative.getAddress() }))
          .to.be.revertedWithCustomError(factory, "InvalidConfig");
        await expect(factory.deploy({ ...config, keyHash: ethers.id("unregistered-lane") }))
          .to.be.revertedWithCustomError(factory, "InvalidConfig");
        const round = await factory.deploy(config);
        expect(await round.vrfCoordinator()).to.equal(official.coordinator);
        await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
        await round.activateSale();
        await round.mint(owner.address, 1, { value: 100n });
        // The stub has zero-initialized storage, including request/subscription counters.
        await round.requestRandomness();
        expect(await round.requestId()).to.equal(0n);
        expect(await round.randomnessRequested()).to.equal(true);
        await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
        await coordinator.fulfillRequest(0, 0, { gasLimit: 500000 });
        expect(await round.randomnessReceived()).to.equal(true);
        await round.finalizeDraw(1);
        expect(await round.winningTokenId()).to.equal(1n);
      } finally {
        await connection.close();
      }
    });
  }

  it("rejects other chains even when a coordinator contract exists", async function () {
    const connection = await network.create({ network: "hardhatMainnet", override: { chainId: 8453 } });
    const { ethers, networkHelpers } = connection;
    try {
      const [owner] = await ethers.getSigners();
      const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
      const factory = await ethers.getContractFactory("ManekinekoRoundV2");
      await expect(factory.deploy({
        name: "Unsupported", symbol: "TEST", roundId: 1, maxSupply: 1, mintPrice: 100,
        mintDeadline: BigInt(await networkHelpers.time.latest()) + 86400n, initialOwner: owner.address,
        vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("test-key"),
        requestConfirmations: 64, callbackGasLimit: 200000,
      })).to.be.revertedWithCustomError(factory, "UnsupportedChain");
    } finally {
      await connection.close();
    }
  });
});
