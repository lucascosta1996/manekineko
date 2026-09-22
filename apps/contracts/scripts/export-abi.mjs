import { readFile, mkdir, writeFile } from "node:fs/promises";

const output = new URL("../../../packages/contracts/src/", import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ["ManekinekoRound", "ManekinekoFactory", "ManekinekoRoundV2", "ManekinekoFactoryV2", "ManekinekoRoundV3", "ManekinekoFactoryV3", "ManekinekoRendererV3", "ManekinekoRoundV4", "ManekinekoFactoryV4", "ManekinekoRendererV4", "ManekinekoRoundDeployerV4", "ManekinekoRoundV5", "ManekinekoFactoryV5", "ManekinekoRendererV5", "ManekinekoRoundDeployerV5", "ManekinekoRoundV6", "ManekinekoFactoryV6", "ManekinekoRendererV6", "ManekinekoRoundDeployerV6", "ManekinekoWinnerCredits", "ManekinekoAffiliateEligibility", "ManekinekoRoundV7", "ManekinekoFactoryV7", "ManekinekoRendererV7", "ManekinekoRoundDeployerV7", "ManekinekoAffiliateEligibilityV2", "ManekinekoWinnerCreditsV3", "ManekinekoRoundV8", "ManekinekoFactoryV8", "ManekinekoRendererV8", "ManekinekoRoundDeployerV8", "ManekinekoAffiliateEligibilityV3", "ManekinekoWinnerCreditsV4", "ManekinekoRoundV9", "ManekinekoFactoryV9", "ManekinekoRendererV9", "ManekinekoRoundDeployerV9", "ManekinekoAffiliateEligibilityV4", "ManekinekoWinnerCreditsV5", "ManekinekoRoundV10", "ManekinekoFactoryV10", "ManekinekoRendererV10", "ManekinekoRoundDeployerV10", "ManekinekoAffiliateEligibilityV5", "ManekinekoWinnerCreditsV6"]) {
  const artifact = JSON.parse(await readFile(new URL(`../artifacts/contracts/${name}.sol/${name}.json`, import.meta.url), "utf8"));
  await writeFile(new URL(`${name}.json`, output), `${JSON.stringify(artifact.abi, null, 2)}\n`);
  const source = await readFile(new URL(`../contracts/${name}.sol`, import.meta.url), "utf8");
  const rankingSource = ["ManekinekoRoundV2", "ManekinekoRoundV3", "ManekinekoRoundV4", "ManekinekoRoundV5", "ManekinekoRoundV6", "ManekinekoRoundV7", "ManekinekoRoundV8", "ManekinekoRoundV9", "ManekinekoRoundV10"].includes(name)
    ? await readFile(new URL((name.endsWith("V8") || name.endsWith("V9") || name.endsWith("V10")) ? "../contracts/libraries/MultiAwardRank.sol" : name.endsWith("V7") ? "../contracts/libraries/AwardRank.sol" : "../contracts/libraries/UniqueRank.sol", import.meta.url), "utf8")
    : undefined;
  const rendererSource = ["ManekinekoRoundV3", "ManekinekoRoundV4", "ManekinekoRoundV5", "ManekinekoRoundV6", "ManekinekoRoundV7", "ManekinekoRoundV8", "ManekinekoRoundV9", "ManekinekoRoundV10"].includes(name)
    ? await readFile(new URL(`../contracts/ManekinekoRenderer${name.endsWith("V10") ? "V10" : name.endsWith("V9") ? "V9" : name.endsWith("V8") ? "V8" : name.endsWith("V7") ? "V7" : name.endsWith("V6") ? "V6" : name.endsWith("V5") ? "V5" : name.endsWith("V4") ? "V4" : "V3"}.sol`, import.meta.url), "utf8")
    : undefined;
  await writeFile(new URL(`${name}.source.json`, output), `${JSON.stringify({ contractName: name, compiler: "0.8.37", source, rankingSource, rendererSource, ...(/^Manekineko(Round|Renderer|Factory|RoundDeployer)V/.test(name) && ["V6", "V7", "V8", "V9", "V10"].some(version => name.endsWith(version)) ? { combinationSource: await readFile(new URL("../contracts/libraries/ScrambledRank.sol", import.meta.url), "utf8"), compilerSettings: { optimizer: { enabled: true, runs: 1 }, evmVersion: "cancun", viaIR: true } } : {}) }, null, 2)}\n`);
  const deployedSize = (artifact.deployedBytecode.length - 2) / 2;
  const initSize = (artifact.bytecode.length - 2) / 2;
  if (deployedSize > 24_576 || initSize > 49_152) throw new Error(`${name} exceeds EVM deployment size limits`);
  console.log(`${name}: ABI exported; runtime ${deployedSize} / 24576 bytes, creation ${initSize} / 49152 bytes.`);
}
