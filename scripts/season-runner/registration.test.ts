import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { seasonVersionPolicy, type SeasonContractVersion } from "./version.ts";
import { runtimeArtifact } from "../../apps/launch/test/season-runtime.fixture.ts";
import { registerVerifiedCollection, seasonFactorySeriesId } from "./registration.ts";
import type { ChainDeployment } from "./chain.ts";

function fixture(chainId: 1 | 11155111, version: SeasonContractVersion = "affiliate-v9") {
  const policy = seasonVersionPolicy(version);
  const payload = runtimeArtifact().steps[0].payload;
  payload.contract.algorithmVersion = policy.algorithmVersion as typeof payload.contract.algorithmVersion;
  payload.contract.chainId = String(chainId); payload.contract.saleStartAt = "2051233200";
  const timestamp = 2051229600;
  const config = { ...policy.parseConfig(payload.contract, BigInt(chainId), BigInt(timestamp)).config, roundId: 1n, affiliateEligibility: payload.operations.affiliateEligibilityAddress! };
  const deployment: ChainDeployment = {
    factory: `0x${"6".repeat(40)}`, round: `0x${"7".repeat(40)}`, roundId: "1", subscriptionId: "1", deploymentBlock: 100, deploymentBlockHash: `0x${"8".repeat(64)}`,
    deploymentTransactionHash: `0x${"9".repeat(64)}`, factoryCodeHash: `0x${"a".repeat(64)}`, roundCodeHash: `0x${"b".repeat(64)}`, renderer: `0x${"c".repeat(40)}`, deployer: `0x${"d".repeat(40)}`,
    config: Object.fromEntries(Object.entries(config).map(([key, value]) => [key, String(value)])),
  };
  if (policy.permanent) {
    deployment.factory = `0x${"e".repeat(40)}`; deployment.round = `0x${"f".repeat(40)}`;
    deployment.deploymentTransactionHash = `0x${"1".repeat(64)}`;
  }
  return { payload, deployment, timestamp };
}
test("factory series identity remains stable and separates networks", () => {
  const factory = `0x${"6".repeat(40)}`;
  assert.equal(seasonFactorySeriesId(11155111, factory), seasonFactorySeriesId(11155111, factory));
  assert.notEqual(seasonFactorySeriesId(1, factory), seasonFactorySeriesId(11155111, factory));
  assert.match(seasonFactorySeriesId(1, factory), /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
});
test("catalog admission rejects relabeled V8 and altered constructor before database access", async () => {
  const f = fixture(11155111);
  let calls = 0; const pool = { connect: async () => { calls++; throw new Error("must not connect"); } } as unknown as pg.Pool;
  await assert.rejects(registerVerifiedCollection(pool, randomUUID(), { ...f.deployment, config: { ...f.deployment.config, maxSupply: "999" } }, f.payload, 11155111, f.timestamp), /frozen maxSupply/);
  f.payload.contract.maxMintsPerWallet = undefined;
  await assert.rejects(registerVerifiedCollection(pool, randomUUID(), f.deployment, f.payload, 11155111, f.timestamp), /V9\/V10 terms/);
  assert.equal(calls, 0);
});

const connection = process.env.SEASON_RUNTIME_TEST_DATABASE_URL;
test("catalog registration is atomic, immutable and resumable on Mainnet and Sepolia in an isolated database", { skip: !connection }, async () => {
  const url = new URL(connection!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Registration integration tests require an explicitly isolated local PostgreSQL server");
  const name = `tincta_registration_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.href });
  let pool: pg.Pool | undefined, created = false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE ${name}`); created = true;
    url.pathname = `/${name}`; pool = new pg.Pool({ connectionString: url.href, max: 4 });
    const migrations = new URL("../../database/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await pool.query(await readFile(new URL(file, migrations), "utf8"));
    for (const chainId of [1, 11155111] as const) for (const version of ["affiliate-v9", "affiliate-v10"] as const) {
      const f = fixture(chainId, version), stepId = randomUUID();
      const results = await Promise.all([registerVerifiedCollection(pool, stepId, f.deployment, f.payload, chainId, f.timestamp), registerVerifiedCollection(pool, stepId, f.deployment, f.payload, chainId, f.timestamp)]);
      assert.deepEqual(results.map(result => result.existing).sort(), [false, true]);
      const program = (await pool.query("SELECT * FROM manekineko_affiliate_programs WHERE collection_id=$1", [stepId])).rows[0];
      assert.equal(program.enrollment_enabled, false); assert.equal(program.contract_version, version);
      assert.equal((await pool.query("SELECT * FROM manekineko_collection_state WHERE collection_id=$1", [stepId])).rows.length, 0, "Indexer alone publishes chain state");
      await pool.query("UPDATE manekineko_affiliate_programs SET enrollment_enabled=true WHERE collection_id=$1", [stepId]);
      await registerVerifiedCollection(pool, stepId, f.deployment, f.payload, chainId, f.timestamp);
      assert.equal((await pool.query("SELECT enrollment_enabled FROM manekineko_affiliate_programs WHERE collection_id=$1", [stepId])).rows[0].enrollment_enabled, true);
      await pool.query("UPDATE manekineko_collections SET name='Different frozen name' WHERE id=$1", [stepId]);
      await assert.rejects(registerVerifiedCollection(pool, stepId, f.deployment, f.payload, chainId, f.timestamp), /refusing to relabel/);
      assert.equal((await pool.query("SELECT name FROM manekineko_collections WHERE id=$1", [stepId])).rows[0].name, "Different frozen name");
    }
  } finally {
    await pool?.end(); if (created) await admin.query(`DROP DATABASE ${name}`); await admin.end();
  }
});
