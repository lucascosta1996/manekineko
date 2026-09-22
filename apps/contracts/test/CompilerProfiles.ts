import { expect } from "chai";
import { createRequire } from "node:module";
import { join } from "node:path";
import hre from "hardhat";

const require = createRequire(import.meta.url);
const solc: { compile(input: string): string; version(): string } = require("solc");
const names = ["ManekinekoFactoryV5", "ManekinekoRoundV5", "ManekinekoRendererV5", "ManekinekoRoundDeployerV5"] as const;

async function verificationInput(profile: string, version = "V5") {
  const source = join(hre.config.paths.root, `contracts/ManekinekoFactory${version}.sol`);
  const jobs = await hre.solidity.getCompilationJobs([source], { buildProfile: profile, quiet: true, force: true });
  if (!jobs.success) throw new Error("Cannot resolve the reviewed Solidity compiler input.");
  return jobs.compilationJobsPerFile.get(source)!.getSolcInput();
}

describe("Reviewed deployment and explorer compiler profiles", function () {
  it("pins default and production to identical compiler, local binary, optimizer and Cancun settings", function () {
    const profiles = hre.config.solidity.profiles;
    expect(profiles.production.compilers).to.deep.equal(profiles.default.compilers);
    for (const profile of [profiles.default, profiles.production]) {
      expect(profile.compilers).to.have.length(1);
      expect(profile.compilers[0].version).to.equal("0.8.37");
      expect(profile.compilers[0].path).to.equal(require.resolve("solc/soljson.js"));
      expect(profile.compilers[0].settings.evmVersion).to.equal("cancun");
      expect(profile.compilers[0].settings.optimizer).to.deep.equal({ enabled: true, runs: 200 });
    }
    expect(solc.version()).to.match(/^0\.8\.37\+commit\.f401782d\./);
  });

  it("produces identical verification input and preserves all four deployed V5 component bytecodes", async function () {
    this.timeout(20_000);
    const [normal, verification] = await Promise.all([verificationInput("default"), verificationInput("production")]);
    expect(verification).to.deep.equal(normal);
    const output = JSON.parse(solc.compile(JSON.stringify(verification)));
    expect((output.errors ?? []).filter((error: { severity: string }) => error.severity === "error")).to.deep.equal([]);
    for (const name of names) {
      const artifact = await hre.artifacts.readArtifact(name);
      const compiled = output.contracts[artifact.inputSourceName][name];
      expect(`0x${compiled.evm.bytecode.object}`, `${name} creation bytecode`).to.equal(artifact.bytecode);
      expect(`0x${compiled.evm.deployedBytecode.object}`, `${name} runtime bytecode`).to.equal(artifact.deployedBytecode);
    }
  });

  for (const version of ["V6", "V10"]) it(`pins ${version} verification to identical IR settings and all four deployment artifacts`, async function () {
    this.timeout(120_000);
    const [normal, verification] = await Promise.all([verificationInput("default", version), verificationInput("production", version)]);
    expect(verification).to.deep.equal(normal);
    expect(verification.settings.viaIR).to.equal(true);
    expect(verification.settings.optimizer).to.deep.equal({ enabled: true, runs: 1 });
    const output = JSON.parse(solc.compile(JSON.stringify(verification)));
    expect((output.errors ?? []).filter((error: { severity: string }) => error.severity === "error")).to.deep.equal([]);
    for (const previousName of names) {
      const name = previousName.replace("V5", version);
      const artifact = await hre.artifacts.readArtifact(name);
      if (!artifact.inputSourceName) throw new Error(`${name} has no compiler source identity.`);
      const compiled = output.contracts[artifact.inputSourceName][name];
      expect(`0x${compiled.evm.bytecode.object}`, `${name} creation bytecode`).to.equal(artifact.bytecode);
      expect(`0x${compiled.evm.deployedBytecode.object}`, `${name} runtime bytecode`).to.equal(artifact.deployedBytecode);
    }
  });
});
