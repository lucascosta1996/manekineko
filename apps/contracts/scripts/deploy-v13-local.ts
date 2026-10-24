/** Fictional, disposable local rehearsal. Refuses every public chain. */
import { network } from "hardhat";
import { writeFile } from "node:fs/promises";
const { ethers } = await network.create();
if ((await ethers.provider.getNetwork()).chainId !== 31337n)
  throw new Error("Local chain 31337 only.");
const [operator] = await ethers.getSigners();
const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
const credits = await ethers.deployContract("ManekinekoWinnerCreditsV9", [
  operator.address,
  ethers.ZeroHash,
  ethers.ZeroAddress,
]);
const options = [
  {
    supply: 1000,
    price: ethers.parseEther("0.01"),
    winners: 6,
    duration: 3600,
  },
  {
    supply: 2000,
    price: ethers.parseEther("0.02"),
    winners: 4,
    duration: 86400,
  },
];
const controller = await ethers.deployContract(
  "ManekinekoSeasonControllerV13",
  [
    {
      operator: operator.address,
      coordinator: await coordinator.getAddress(),
      credits: await credits.getAddress(),
      keyHash: ethers.id("local-vrf"),
      confirmations: 64,
      callbackGas: 200000,
      votingDuration: 3600,
      votingDelay: 60,
      randomnessBudget: ethers.parseEther("0.01"),
      sponsorshipBudget: ethers.parseEther("0.04"),
      bootstrapAllowed: true,
    },
    options,
  ]
);
const holderRewards = await ethers.deployContract(
  "ManekinekoHolderRewardsV13",
  [await controller.getAddress()]
);
await (
  await controller.bindHolderRewards(await holderRewards.getAddress())
).wait();
const deployer = await ethers.deployContract("ManekinekoRoundDeployerV13", [
  await controller.getAddress(),
]);
await (await controller.bindDeployer(await deployer.getAddress())).wait();
const controllerCodeHash = ethers.keccak256(
  await ethers.provider.getCode(await controller.getAddress())
);
await (
  await credits.approveFactory(
    await controller.getAddress(),
    controllerCodeHash
  )
).wait();
await (await credits.sealFactories()).wait();
await (
  await controller.appendCollections(
    [1, 2, 3].map((i) => ({
      seasonId: ethers.id("Local V13 rehearsal"),
      seasonName: "Local V13 rehearsal",
      name: `Fictional collection ${i}`,
      symbol: `LOCAL${i}`,
      color: "#330000",
      textColor: "#FFFFFF",
    }))
  )
).wait();
await (await controller.sealCatalog()).wait();
await (
  await operator.sendTransaction({
    to: await controller.getAddress(),
    value: ethers.parseEther("1"),
  })
).wait();
await (await controller.prepareNext()).wait();
const result = {
  chainId: 31337,
  controller: await controller.getAddress(),
  controllerCodeHash,
  holderRewards: await holderRewards.getAddress(),
  holderRewardsCodeHash: ethers.keccak256(
    await ethers.provider.getCode(await holderRewards.getAddress())
  ),
  credits: await credits.getAddress(),
  voting: await controller.voting(),
  coordinator: await coordinator.getAddress(),
  round: await controller.rounds(1),
  operator: operator.address,
};
if (process.env.V13_LOCAL_OUTPUT)
  await writeFile(
    process.env.V13_LOCAL_OUTPUT,
    JSON.stringify(result, null, 2) + "\n",
    {
      flag: "wx",
      mode: 0o600,
    }
  );
console.log(JSON.stringify(result, null, 2));
