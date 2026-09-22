import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { createLaunchConfiguration, finalizeLaunchConfiguration, exportLaunchConfiguration } from "../apps/launch/lib/launch-config-store.ts";
import { createLaunchAutomation, prepareLaunchAutomation, exportLaunchAutomation } from "../apps/launch/lib/launch-automation-store.ts";
import { launchFixture } from "../apps/launch/test/launch-config.fixture.ts";
import { automationFixture, AUTOMATION_NOW } from "../apps/launch/test/launch-automation.fixture.ts";
import { LAUNCH_ROLE, WEB_ROLE, parseStagingDatabaseConfig, provisionStagingDatabase, rolePasswordMaterial, stagingDatabaseErrorMessage } from "./staging-database.mjs";

function envFixture() {
  return {
    STAGING_DATABASE_ID: "70a502a6-dcb8-4a34-b8fb-e553bfd86246",
    STAGING_DATABASE_EXPECTED_HOST: "staging-db.example.com",
    STAGING_DATABASE_EXPECTED_NAME: "manekineko_sepolia",
    DATABASE_ADMIN_URL: "postgresql://admin:private-admin-password@staging-db.example.com/manekineko_sepolia?sslmode=verify-full",
    WEB_DATABASE_URL: `postgresql://${WEB_ROLE}:${"w".repeat(32)}@staging-db.example.com/manekineko_sepolia?sslmode=verify-full`,
    LAUNCH_DATABASE_URL: `postgresql://${LAUNCH_ROLE}:${"l".repeat(32)}@staging-db.example.com/manekineko_sepolia?sslmode=verify-full`,
  };
}

test("staging config pins one remote database with distinct restricted roles and verified TLS", () => {
  const result = parseStagingDatabaseConfig(envFixture());
  assert.equal(result.database, "manekineko_sepolia");
  assert.equal(result.web.username, WEB_ROLE);
  assert.equal(result.launch.username, LAUNCH_ROLE);
});

function passwordFixture(host = "ep-staging.aws-us-east-1.neon.tech", suffix = "?sslmode=verify-full") {
  return { host, admin: { connectionString: `postgresql://admin:admin-password@${host}/staging${suffix}` } };
}

test("Neon role password compatibility is restricted to exact verified TLS endpoints", () => {
  const secret = "fictional-Neon-test-password-1234";
  assert.equal(rolePasswordMaterial(passwordFixture(), secret), secret);
  assert.throws(() => rolePasswordMaterial(passwordFixture(undefined, "?sslmode=require"), secret), /verified TLS/);
  assert.throws(() => rolePasswordMaterial(passwordFixture(undefined, "?sslmode=verify-full&sslmode=disable"), secret), /verified TLS/);
  assert.throws(() => rolePasswordMaterial({ ...passwordFixture(), host: "other.neon.tech" }, secret), /pinned endpoint/);
});

test("non-Neon and lookalike hosts retain SCRAM verifier provisioning", () => {
  const secret = "fictional-provider-test-password-1234";
  for (const host of ["database.example.com", "fake-neon.tech", "neon.tech.attacker.example", "ep.neon.tech.attacker.example", "neon.tech"]) {
    const material = rolePasswordMaterial(passwordFixture(host), secret);
    assert.match(material, /^SCRAM-SHA-256\$4096:/);
    assert.equal(material.includes(secret), false);
  }
  const userinfo = passwordFixture();
  userinfo.admin.connectionString = "postgresql://ep.neon.tech:password@attacker.example/staging?sslmode=verify-full";
  assert.match(rolePasswordMaterial(userinfo, secret), /^SCRAM-SHA-256\$4096:/);
});

test("provider errors cannot expose role passwords or SQL in CLI diagnostics", () => {
  const secret = "fictional-private-password-'\\-1234";
  const error = Object.assign(new Error(`CREATE ROLE example PASSWORD '${secret}'`), { detail: secret, query: secret, code: "XX000" });
  const diagnostic = stagingDatabaseErrorMessage(error);
  assert.equal(diagnostic.includes(secret), false);
  assert.equal(diagnostic.includes("CREATE ROLE example"), false);
  assert.match(diagnostic, /Provider error details were withheld/);
  const client = new pg.Client();
  const material = rolePasswordMaterial(passwordFixture(), secret);
  assert.equal(client.escapeLiteral(material), ` E'fictional-private-password-''\\\\-1234'`);
});

for (const [name, change] of [
  ["missing marker", (e) => delete e.STAGING_DATABASE_ID],
  ["unmatched database", (e) => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("manekineko_sepolia", "production"); }],
  ["unmatched endpoint", (e) => { e.LAUNCH_DATABASE_URL = e.LAUNCH_DATABASE_URL.replace("staging-db", "production-db"); }],
  ["shared role", (e) => { e.WEB_DATABASE_URL = e.DATABASE_ADMIN_URL; }],
  ["TLS downgrade", (e) => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("verify-full", "require"); }],
  ["duplicate TLS modes", (e) => { e.WEB_DATABASE_URL += "&sslmode=disable"; }],
  ["encoded duplicate TLS modes", (e) => { e.DATABASE_ADMIN_URL += "&%73slmode=disable"; }],
  ["duplicate channel binding", (e) => { e.LAUNCH_DATABASE_URL += "&channel_binding=require&channel_binding=disable"; }],
  ["SQL search path options", (e) => { e.DATABASE_ADMIN_URL += "&options=-c%20search_path%3Dproduction"; }],
  ["short password", (e) => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("w".repeat(32), "short"); }],
  ["shared password", (e) => { e.LAUNCH_DATABASE_URL = e.LAUNCH_DATABASE_URL.replace("l".repeat(32), "w".repeat(32)); }],
  ["default database", (e) => { e.STAGING_DATABASE_EXPECTED_NAME = "postgres"; }],
  ["local database", (e) => { e.STAGING_DATABASE_EXPECTED_HOST = "localhost"; }],
]) test(`staging config rejects ${name}`, () => {
  const env = envFixture(); change(env);
  assert.throws(() => parseStagingDatabaseConfig(env));
});

test("isolated PostgreSQL provision, rerun and runtime role boundaries", {
  skip: !process.env.STAGING_DATABASE_TEST_URL && "Set STAGING_DATABASE_TEST_URL to a disposable local PostgreSQL cluster; never an app database.",
}, async (t) => {
  const supplied = new URL(process.env.STAGING_DATABASE_TEST_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(supplied.hostname), "Database integration tests must stay local.");
  const cluster = new pg.Client({ connectionString: supplied.href });
  const name = `staging_test_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(supplied); adminUrl.pathname = `/${name}`;
  function runtime(role, password) {
    const url = new URL(adminUrl); url.username = role; url.password = password;
    return { username: role, password, connectionString: url.href };
  }
  const config = {
    id: randomUUID(), host: supplied.hostname, database: name,
    admin: { username: decodeURIComponent(supplied.username), connectionString: adminUrl.href },
    web: runtime(WEB_ROLE, "isolated-web-runtime-password-1234"),
    launch: runtime(LAUNCH_ROLE, "isolated-launch-runtime-password-1234"),
  };
  let admin, web, launch, checkedEmptyRoles = false, createdDatabase = false;
  await cluster.connect();
  try {
    const existing = await cluster.query("SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])", [[WEB_ROLE, LAUNCH_ROLE]]);
    assert.equal(existing.rowCount, 0, "Use a fresh disposable cluster; existing runtime roles must never be modified by this test.");
    checkedEmptyRoles = true;
    await cluster.query(`CREATE DATABASE ${name}`);
    createdDatabase = true;
    admin = new pg.Client({ connectionString: adminUrl.href }); await admin.connect();
    const log = () => {};
    await t.test("read-only preflight leaves an empty database unchanged", async () => {
      assert.deepEqual(await provisionStagingDatabase(config, { mode: "check", log }), { initialized: false });
      assert.equal((await admin.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, "0");
    });
    await t.test("first provision refuses nonempty unmarked databases without creating roles", async () => {
      await admin.query("CREATE TABLE existing_application(id integer)");
      await assert.rejects(() => provisionStagingDatabase(config, { mode: "provision", log }), /Refusing to adopt a nonempty database/);
      assert.equal((await admin.query("SELECT to_regclass('public.manekineko_staging_environment') AS marker")).rows[0].marker, null);
      assert.equal((await admin.query("SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])", [[WEB_ROLE, LAUNCH_ROLE]])).rowCount, 0);
      await admin.query("DROP TABLE existing_application");
    });
    await t.test("first provision applies all migrations and registers Sepolia without demo seeds", async () => {
      await provisionStagingDatabase(config, { mode: "provision", log });
      const migrationCount = (await readdir(new URL("../database/migrations/", import.meta.url))).filter(name => name.endsWith(".sql")).length;
      assert.equal(Number((await admin.query("SELECT count(*) AS n FROM manekineko_schema_migrations")).rows[0].n), migrationCount);
      assert.deepEqual((await admin.query("SELECT chain_id::text FROM manekineko_networks")).rows, [{ chain_id: "11155111" }]);
      for (const table of ["manekineko_collections", "manekineko_collection_history", "manekineko_affiliate_demo_accounts", "manekineko_launch_users"]) {
        assert.equal((await admin.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n, "0");
      }
    });
    await t.test("reruns preserve migrations and marker; wrong markers fail before changes", async () => {
      await provisionStagingDatabase(config, { mode: "provision", log });
      await assert.rejects(() => provisionStagingDatabase({ ...config, id: randomUUID() }, { mode: "provision", log }), /marker does not match/);
      assert.equal((await admin.query("SELECT instance_id FROM manekineko_staging_environment")).rows[0].instance_id, config.id);
    });
    web = new pg.Client({ connectionString: config.web.connectionString }); await web.connect();
    launch = new pg.Client({ connectionString: config.launch.connectionString }); await launch.connect();
    const denied = (operation) => assert.rejects(operation, (error) => error.code === "42501");
    await t.test("public web cannot read launch accounts, edit catalog, claim ownership or create schema objects", async () => {
      await web.query("SELECT * FROM manekineko_collections");
      await web.query("SELECT * FROM manekineko_collection_awards");
      await denied(() => web.query("DELETE FROM manekineko_collection_awards"));
      await denied(() => web.query("SELECT * FROM manekineko_launch_users"));
      await denied(() => web.query("UPDATE manekineko_collections SET name='Compromised'"));
      await denied(() => web.query("UPDATE manekineko_staging_environment SET instance_id=gen_random_uuid()"));
      await denied(() => web.query("CREATE TABLE public.unexpected(id integer)"));
      await denied(() => web.query("CREATE SCHEMA unexpected"));
    });
    const user = randomUUID();
    await admin.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,'test-operator',$2)", [user, `scrypt$131072$8$1$${"A".repeat(22)}$${"A".repeat(86)}`]);
    await t.test("launch row locks, session writes and audit-trigger sequences work under restricted role", async () => {
      await launch.query("SELECT * FROM manekineko_launch_users WHERE id=$1 FOR UPDATE", [user]);
      await launch.query("INSERT INTO manekineko_launch_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", ["a".repeat(64), user]);
      const payload = { contract: { chainId: "11155111", affiliatePoolBps: "1000" }, operations: {} };
      const configuration = randomUUID();
      await launch.query("INSERT INTO manekineko_launch_configurations(id,label,payload,created_by,updated_by) VALUES($1,'Staging configuration',$2,$3,$3)", [configuration, payload, user]);
      await launch.query("UPDATE manekineko_launch_configurations SET label='Saved draft',revision=revision+1 WHERE id=$1", [configuration]);
      const plan = { name: "Staging automation", chainId: "11155111", startAt: null, intervalSeconds: "0", failurePolicy: "pause", steps: [{ payload }] };
      await launch.query("INSERT INTO manekineko_launch_automations(id,plan,created_by,updated_by) VALUES($1,$2,$3,$3)", [randomUUID(), plan, user]);
      assert.equal((await admin.query("SELECT count(*) AS n FROM manekineko_launch_configuration_events")).rows[0].n, "2");
      assert.equal((await admin.query("SELECT count(*) AS n FROM manekineko_launch_automation_events")).rows[0].n, "1");
    });
    await t.test("launch cannot change credentials, read enrollment secrets or rewrite audit history", async () => {
      await denied(() => launch.query("UPDATE manekineko_launch_users SET password_hash=password_hash"));
      await denied(() => launch.query("UPDATE manekineko_launch_users SET disabled_at=NULL"));
      await denied(() => launch.query("SELECT * FROM manekineko_affiliate_challenges"));
      await denied(() => launch.query("DELETE FROM manekineko_launch_configuration_events"));
    });
    await t.test("restricted launch role can finalize V5 and V6 snapshots and prepare matching automations", async () => {
      const actor = { userId: user };
      for (const version of ["affiliate-v5", "affiliate-v6"]) {
        const payload = launchFixture(); payload.contract.affiliatePoolBps = "1000"; payload.contract.affiliateRatesBps = [];
        if (version === "affiliate-v6") {
          Object.assign(payload.contract, { algorithmVersion: "unique-rank-v3", seasonId: `0x${"a".repeat(64)}`, seasonName: "Aster Vale", collectionColor: "#330000", textColor: "#FFFFFF" });
          Object.assign(payload.operations, { winnerCreditsAddress: `0x${"4".repeat(40)}`, winnerCreditSponsorshipWei: "10000000000000000", affiliateEligibilityAddress: `0x${"5".repeat(40)}` });
        }
        const configuration = await createLaunchConfiguration(launch, actor, { label: `Restricted ${version}`, payload });
        const finalized = await finalizeLaunchConfiguration(launch, actor, configuration.id, configuration.revision);
        assert.equal(finalized.status, "finalized");
        assert.equal((await exportLaunchConfiguration(launch, configuration.id)).artifact.contractVersion, version);
        const plan = automationFixture();
        if (version === "affiliate-v6") Object.assign(plan, { name: "Aster Vale", seasonId: `0x${"a".repeat(64)}` });
        for (const step of plan.steps) {
          step.payload.contract.affiliatePoolBps = "1000"; step.payload.contract.affiliateRatesBps = [];
          if (version === "affiliate-v6") {
            Object.assign(step.payload.contract, { algorithmVersion: "unique-rank-v3", seasonId: `0x${"a".repeat(64)}`, seasonName: "Aster Vale", collectionColor: "#330000", textColor: "#FFFFFF" });
            Object.assign(step.payload.operations, { winnerCreditsAddress: `0x${"4".repeat(40)}`, winnerCreditSponsorshipWei: "10000000000000000", affiliateEligibilityAddress: `0x${"5".repeat(40)}` });
          }
        }
        const automation = await createLaunchAutomation(launch, actor, { plan });
        const prepared = await prepareLaunchAutomation(launch, actor, automation.id, automation.revision, AUTOMATION_NOW);
        assert.equal(prepared.status, "prepared");
        assert.equal((await exportLaunchAutomation(launch, automation.id)).artifact.contractVersion, version);
      }
      await denied(() => web.query("SELECT manekineko_launch_payload_version($1::jsonb)", [{ contract: {} }]));
    });
    await t.test("restricted launch role can validate V8 six-winner season plans", async () => {
      const payload = launchFixture();
      Object.assign(payload.contract, { algorithmVersion: "unique-rank-v5", winnerCount: "6", affiliatePoolBps: "2000", affiliateRatesBps: [], minAffiliateReferrals: "100", affiliatePayoutCapBps: "3000", saleStartAt: "0", seasonId: `0x${"a".repeat(64)}`, seasonName: "Aster Vale", collectionColor: "#330000", textColor: "#FFFFFF" });
      const plan = { name: "Aster Vale", seasonId: payload.contract.seasonId, chainId: "11155111", intervalSeconds: "0", failurePolicy: "pause", steps: [{ payload }], timing: { version: 1, anchor: "previous_sellout", nextLaunchDelaySeconds: "3600", nextAnnouncementDelaySeconds: "1800", winnerAnnouncement: "after_verified_draw", missedLaunchPolicy: "pause" } };
      const result = (await launch.query("SELECT manekineko_launch_payload_version($1::jsonb) version,manekineko_valid_launch_season($2::jsonb) season,manekineko_valid_season_timing($2::jsonb) timing", [payload, plan])).rows[0];
      assert.deepEqual(result, { version: "affiliate-v8", season: true, timing: true });
      await denied(() => web.query("SELECT manekineko_valid_equal_prizes($1::jsonb)", [payload]));
    });
    await t.test("database staging constraints reject Mainnet network and launch configuration", async () => {
      await assert.rejects(() => admin.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES(1,'Ethereum Mainnet','ETH',18,'https://etherscan.io')"), (e) => e.code === "23514");
      await assert.rejects(() => launch.query("INSERT INTO manekineko_launch_configurations(id,label,payload,created_by,updated_by) VALUES($1,'Mainnet',$2,$3,$3)", [randomUUID(), { contract: { chainId: "1" }, operations: {} }, user]), (e) => e.code === "23514");
    });
    await t.test("web challenge issuance, single-use consumption and quota writes work under restricted role", async () => {
      const series = randomUUID(), collection = randomUUID(), challenge = randomUUID();
      const wallet = `0x${"a".repeat(40)}`, contract = `0x${"b".repeat(40)}`;
      await admin.query("INSERT INTO manekineko_series(id,name) VALUES($1,'Permission test')", [series]);
      await admin.query(`INSERT INTO manekineko_collections(id,series_id,chain_id,round_id,slug,name,symbol,max_supply,mint_price_wei,mint_duration_seconds,reveal_delay_blocks,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
        VALUES($1,$2,11155111,1,'permission-test','Permission test','TEST',20,10000,3600,NULL,'unique-rank-v2','chainlink-vrf-v2.5','affiliate-v5',5000,1000)`, [collection, series]);
      await admin.query(`INSERT INTO manekineko_deployments(collection_id,chain_id,status,contract_address,factory_address,owner_address,transaction_hash,deployment_block,mint_deadline,deployed_at)
        VALUES($1,11155111,'deployed',$2,$2,$3,$4,1,now()+interval '1 hour',now())`, [collection, contract, wallet, `0x${"c".repeat(64)}`]);
      await admin.query("INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots,enrollment_enabled,enrollment_signer,contract_version,affiliate_rates_bps) VALUES($1,'live',20,true,$2,'affiliate-v5',ARRAY[]::integer[])", [collection, wallet]);
      await web.query(`INSERT INTO manekineko_affiliate_challenges(id,collection_id,wallet,chain_id,contract_address,origin,nonce,ip_digest,expires_at,contract_version,affiliate_id,commission_bps)
        VALUES($1,$2,$3,11155111,$4,'https://staging.example.com',$5,$6,now()+interval '5 minutes','affiliate-v5',1,1000)`, [challenge, collection, wallet, contract, `0x${"d".repeat(64)}`, "e".repeat(64)]);
      assert.equal((await web.query("UPDATE manekineko_affiliate_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL RETURNING id", [challenge])).rowCount, 1);
      assert.equal((await web.query("UPDATE manekineko_affiliate_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL RETURNING id", [challenge])).rowCount, 0);
      await denied(() => web.query("UPDATE manekineko_affiliate_challenges SET wallet=wallet"));
      await web.query("INSERT INTO manekineko_affiliate_rate_limits(collection_id,scope,subject_hash,window_start,attempts) VALUES($1,'challenge_ip',$2,now(),1)", [collection, "f".repeat(64)]);
      await web.query("DELETE FROM manekineko_affiliate_challenges WHERE id=$1", [challenge]);
      await web.query("DELETE FROM manekineko_affiliate_rate_limits WHERE collection_id=$1", [collection]);
    });
    await t.test("rerun revokes accidentally granted column permissions", async () => {
      await admin.query(`GRANT UPDATE(password_hash) ON manekineko_launch_users TO ${LAUNCH_ROLE}`);
      await provisionStagingDatabase(config, { mode: "provision", log });
      await denied(() => launch.query("UPDATE manekineko_launch_users SET password_hash=password_hash"));
    });
    await t.test("unrelated data prevents later provisioning", async () => {
      await admin.query("CREATE TABLE unrelated(id integer)");
      await assert.rejects(() => provisionStagingDatabase(config, { mode: "provision", log }), /Unrelated application tables/);
      await admin.query("DROP TABLE unrelated");
      await provisionStagingDatabase(config, { mode: "check", log });
    });
  } finally {
    await web?.end(); await launch?.end(); await admin?.end();
    if (createdDatabase) await cluster.query(`DROP DATABASE ${name} WITH (FORCE)`);
    // Roles are created only inside the explicitly disposable test cluster.
    if (checkedEmptyRoles) await cluster.query(`DROP ROLE IF EXISTS ${WEB_ROLE},${LAUNCH_ROLE}`);
    await cluster.end();
  }
});
