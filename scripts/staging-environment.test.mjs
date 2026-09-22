import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { serializeStagingEnvironment, stagingEnvironments } from "./staging-environment.mjs";

function fixture() {
  return {
    MANEKINEKO_CHAIN_ID: "11155111",
    STAGING_DATABASE_EXPECTED_HOST: "staging-db.example.com",
    STAGING_DATABASE_EXPECTED_NAME: "manekineko_sepolia",
    WEB_DATABASE_URL: `postgresql://manekineko_staging_web:${"w".repeat(32)}@staging-db.example.com/manekineko_sepolia?sslmode=verify-full`,
    LAUNCH_DATABASE_URL: `postgresql://manekineko_staging_launch:${"l".repeat(32)}@staging-db.example.com/manekineko_sepolia?sslmode=verify-full`,
    AFFILIATE_PUBLIC_ORIGIN: "https://web-staging.example.com",
    LAUNCH_PUBLIC_ORIGIN: "https://launch-staging.example.com",
    AFFILIATE_TRUSTED_PROXY: "vercel",
    AFFILIATE_IP_HASH_SECRET: "i".repeat(32),
    LAUNCH_RATE_LIMIT_SECRET: "r".repeat(32),
    AFFILIATE_ENROLLMENT_PRIVATE_KEY: "0x" + "12".repeat(32),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture-real-format-site-key",
    TURNSTILE_SECRET_KEY: "fixture-real-format-secret-key",
    AFFILIATE_RPC_URL_11155111: "https://sepolia-rpc.example.com",
  };
}

test("imports and pure validation do not read local secrets; exports use per-app allowlists", () => {
  const env = {
    ...fixture(), DATABASE_ADMIN_URL: "admin-do-not-export", DATABASE_URL: "production-do-not-export",
    DEPLOYER_PRIVATE_KEY: "0x" + "34".repeat(32), MAINNET_PRIVATE_KEY: "mainnet-do-not-export",
    LAUNCH_PASSWORD: "password-do-not-export", VERCEL_TOKEN: "token-do-not-export", UNKNOWN_SECRET: "unknown-do-not-export",
    AFFILIATE_RPC_URL_1: "https://mainnet-do-not-export.example.com", NEXT_PUBLIC_PRIVATE_KEY: "accidental-do-not-export",
  };
  const [web, launch] = stagingEnvironments(env);
  assert.equal(web.values.DATABASE_URL, env.WEB_DATABASE_URL);
  assert.equal(launch.values.DATABASE_URL, env.LAUNCH_DATABASE_URL);
  assert.deepEqual(Object.keys(launch.values).sort(), ["DATABASE_URL", "LAUNCH_PUBLIC_ORIGIN", "LAUNCH_RATE_LIMIT_SECRET", "MANEKINEKO_CHAIN_ID"]);
  assert.deepEqual(Object.keys(web.values).sort(), ["AFFILIATE_ENROLLMENT_PRIVATE_KEY", "AFFILIATE_IP_HASH_SECRET", "AFFILIATE_PUBLIC_ORIGIN", "AFFILIATE_RPC_URL_11155111", "AFFILIATE_TRUSTED_PROXY", "DATABASE_URL", "MANEKINEKO_CHAIN_ID", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]);
  for (const { values } of [web, launch]) {
    const exported = serializeStagingEnvironment(values);
    assert.ok(!exported.includes("do-not-export"));
    assert.ok(!exported.includes(env.DEPLOYER_PRIVATE_KEY));
    assert.deepEqual(parseEnv(exported), values);
  }
  assert.ok(!Object.hasOwn(launch.values, "AFFILIATE_ENROLLMENT_PRIVATE_KEY"));
});

for (const [name, change] of [
  ["Mainnet", e => { e.MANEKINEKO_CHAIN_ID = "1"; }],
  ["missing chain", e => { delete e.MANEKINEKO_CHAIN_ID; }],
  ["wrong database", e => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("/manekineko_sepolia", "/production"); }],
  ["wrong host", e => { e.LAUNCH_DATABASE_URL = e.LAUNCH_DATABASE_URL.replace("staging-db.example.com", "production-db.example.com"); }],
  ["administrative role", e => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("manekineko_staging_web:", "admin:"); }],
  ["missing password", e => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("w".repeat(32), ""); }],
  ["TLS downgrade", e => { e.WEB_DATABASE_URL = e.WEB_DATABASE_URL.replace("verify-full", "require"); }],
  ["second TLS parameter", e => { e.WEB_DATABASE_URL += "&sslmode=disable"; }],
  ["query host override", e => { e.WEB_DATABASE_URL += "&host=production-db.example.com"; }],
  ["query user override", e => { e.WEB_DATABASE_URL += "&user=admin"; }],
  ["SQL options override", e => { e.WEB_DATABASE_URL += "&options=-c%20search_path%3Dproduction"; }],
  ["invalid channel binding", e => { e.WEB_DATABASE_URL += "&channel_binding=disable"; }],
  ["default database", e => { e.STAGING_DATABASE_EXPECTED_NAME = "postgres"; }],
  ["local database", e => { e.STAGING_DATABASE_EXPECTED_HOST = "localhost"; }],
  ["shared runtime passwords", e => { e.LAUNCH_DATABASE_URL = e.LAUNCH_DATABASE_URL.replace("l".repeat(32), "w".repeat(32)); }],
  ["different endpoint ports", e => { e.LAUNCH_DATABASE_URL = e.LAUNCH_DATABASE_URL.replace("example.com/", "example.com:5433/"); }],
  ["shared app origins", e => { e.LAUNCH_PUBLIC_ORIGIN = e.AFFILIATE_PUBLIC_ORIGIN; }],
  ["origin path", e => { e.AFFILIATE_PUBLIC_ORIGIN += "/mint"; }],
  ["origin userinfo", e => { e.AFFILIATE_PUBLIC_ORIGIN = "https://private@example.com"; }],
  ["untrusted proxy", e => { e.AFFILIATE_TRUSTED_PROXY = "arbitrary"; }],
  ["zero signer", e => { e.AFFILIATE_ENROLLMENT_PRIVATE_KEY = "0x" + "00".repeat(32); }],
  ["invalid curve signer", e => { e.AFFILIATE_ENROLLMENT_PRIVATE_KEY = "0x" + "ff".repeat(32); }],
  ["reused deployer key", e => { e.DEPLOYER_PRIVATE_KEY = e.AFFILIATE_ENROLLMENT_PRIVATE_KEY; }],
  ["test Turnstile site", e => { e.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"; }],
  ["test Turnstile secret", e => { e.TURNSTILE_SECRET_KEY = "2x0000000000000000000000000000000AA"; }],
  ["insecure RPC", e => { e.AFFILIATE_RPC_URL_11155111 = "http://sepolia-rpc.example.com"; }],
  ["unpaired factory pins", e => { e.AFFILIATE_TRUSTED_FACTORY_V5_11155111 = "0x" + "11".repeat(20); }],
  ["zero factory address", e => { e.AFFILIATE_TRUSTED_FACTORY_V5_11155111 = "0x" + "00".repeat(20); e.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111 = "0x" + "11".repeat(32); }],
  ["invalid runtime hash", e => { e.AFFILIATE_TRUSTED_FACTORY_V5_11155111 = "0x" + "11".repeat(20); e.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111 = "bad"; }],
  ["dotenv expansion", e => { e.AFFILIATE_IP_HASH_SECRET = "$SECRET_FROM_MACHINE".repeat(3); }],
  ["multiline secret", e => { e.LAUNCH_RATE_LIMIT_SECRET += "\nOTHER_VALUE=unsafe"; }],
]) test(`staging environment rejects ${name}`, () => {
  const env = fixture(); change(env);
  assert.throws(() => stagingEnvironments(env));
});

test("verified TLS channel binding, encoded passwords and paired pins remain exportable", () => {
  const env = fixture();
  env.WEB_DATABASE_URL = env.WEB_DATABASE_URL.replace("w".repeat(32), "w".repeat(32) + "%24%40%25") + "&channel_binding=require";
  env.AFFILIATE_TRUSTED_FACTORY_V5_11155111 = "0x" + "11".repeat(20);
  env.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111 = "0x" + "22".repeat(32);
  const [web] = stagingEnvironments(env, "web");
  assert.equal(web.values.AFFILIATE_TRUSTED_FACTORY_V5_11155111, env.AFFILIATE_TRUSTED_FACTORY_V5_11155111);
  assert.deepEqual(parseEnv(serializeStagingEnvironment(web.values)), web.values);
});

test("V6 pins are paired independently and never reuse V5 pins", () => {
  const env = fixture();
  env.AFFILIATE_TRUSTED_FACTORY_V5_11155111 = "0x" + "11".repeat(20);
  env.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111 = "0x" + "22".repeat(32);
  assert.equal(stagingEnvironments(env, "web")[0].values.AFFILIATE_TRUSTED_FACTORY_V6_11155111, undefined);
  env.AFFILIATE_TRUSTED_FACTORY_V6_11155111 = "0x" + "33".repeat(20);
  assert.throws(() => stagingEnvironments(env, "web"), /both verified V6/);
  env.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V6_11155111 = "0x" + "44".repeat(32);
  const values = stagingEnvironments(env, "web")[0].values;
  assert.equal(values.AFFILIATE_TRUSTED_FACTORY_V6_11155111, env.AFFILIATE_TRUSTED_FACTORY_V6_11155111);
  assert.equal(values.AFFILIATE_TRUSTED_FACTORY_V5_11155111, env.AFFILIATE_TRUSTED_FACTORY_V5_11155111);
  assert.equal(stagingEnvironments(env, "launch")[0].values.AFFILIATE_TRUSTED_FACTORY_V6_11155111, undefined);
});

test("winner credit pins are paired, validated and exported only to the Sepolia web app", () => {
  const addressKey = "WINNER_CREDITS_ADDRESS_11155111", hashKey = "WINNER_CREDITS_CODEHASH_11155111";
  const env = fixture();
  env.WINNER_CREDITS_ADDRESS_1 = "0x" + "99".repeat(20);
  env.WINNER_CREDITS_CODEHASH_1 = "0x" + "88".repeat(32);
  env[addressKey] = "0x" + "33".repeat(20);
  assert.throws(() => stagingEnvironments(env), /both canonical winner credit registry pins/);
  env[hashKey] = "0x" + "44".repeat(32);
  const [web, launch] = stagingEnvironments(env);
  assert.equal(web.values[addressKey], env[addressKey]);
  assert.equal(web.values[hashKey], env[hashKey]);
  assert.deepEqual(parseEnv(serializeStagingEnvironment(web.values)), web.values);
  assert.ok(!Object.hasOwn(launch.values, addressKey));
  assert.ok(!Object.hasOwn(launch.values, hashKey));
  assert.ok(!Object.hasOwn(web.values, "WINNER_CREDITS_ADDRESS_1"));
  assert.ok(!Object.hasOwn(web.values, "WINNER_CREDITS_CODEHASH_1"));
  for (const [key, value] of [[addressKey, "bad"], [addressKey, "0x" + "00".repeat(20)], [hashKey, "bad"], [hashKey, "0x" + "00".repeat(32)]]) {
    assert.throws(() => stagingEnvironments({ ...env, [key]: value }), /nonzero winner credit registry address and verified runtime hash/);
  }
  delete env[addressKey];
  assert.throws(() => stagingEnvironments(env), /both canonical winner credit registry pins/);
});

test("holder eligibility pins are paired and isolated from launch and Mainnet exports", () => {
  const addressKey="AFFILIATE_ELIGIBILITY_ADDRESS_11155111", hashKey="AFFILIATE_ELIGIBILITY_CODEHASH_11155111";
  const env=fixture();
  env[addressKey]="0x"+"33".repeat(20);
  assert.throws(()=>stagingEnvironments(env),/both canonical affiliate eligibility pins/);
  env[hashKey]="0x"+"44".repeat(32);
  env.AFFILIATE_ELIGIBILITY_ADDRESS_1="0x"+"55".repeat(20);
  env.AFFILIATE_ELIGIBILITY_CODEHASH_1="0x"+"66".repeat(32);
  const [web,launch]=stagingEnvironments(env);
  assert.equal(web.values[addressKey],env[addressKey]);assert.equal(web.values[hashKey],env[hashKey]);
  assert.ok(!Object.hasOwn(launch.values,addressKey));assert.ok(!Object.hasOwn(web.values,"AFFILIATE_ELIGIBILITY_ADDRESS_1"));
  for(const [key,value]of [[addressKey,"bad"],[addressKey,"0x"+"00".repeat(20)],[hashKey,"0x"+"00".repeat(32)]])assert.throws(()=>stagingEnvironments({...env,[key]:value}),/nonzero affiliate eligibility/);
});

const upgradePairs = [
  ...["V7", "V8"].map(version => [`AFFILIATE_TRUSTED_FACTORY_${version}_11155111`, `AFFILIATE_TRUSTED_FACTORY_CODEHASH_${version}_11155111`]),
  ...["V2", "V3"].map(version => [`AFFILIATE_ELIGIBILITY_${version}_ADDRESS_11155111`, `AFFILIATE_ELIGIBILITY_${version}_CODEHASH_11155111`]),
  ...["PREVIOUS", "ANCESTOR"].map(level => [`WINNER_CREDITS_${level}_ADDRESS_11155111`, `WINNER_CREDITS_${level}_CODEHASH_11155111`]),
];

function withCreditLineage() {
  return {
    ...fixture(),
    WINNER_CREDITS_ADDRESS_11155111: "0x" + "11".repeat(20),
    WINNER_CREDITS_CODEHASH_11155111: "0x" + "12".repeat(32),
    WINNER_CREDITS_PREVIOUS_ADDRESS_11155111: "0x" + "22".repeat(20),
    WINNER_CREDITS_PREVIOUS_CODEHASH_11155111: "0x" + "23".repeat(32),
    WINNER_CREDITS_ANCESTOR_ADDRESS_11155111: "0x" + "33".repeat(20),
    WINNER_CREDITS_ANCESTOR_CODEHASH_11155111: "0x" + "34".repeat(32),
  };
}

test("V7/V8 factory, eligibility and credit lineage pins survive web export without leaking to launch or Mainnet", () => {
  const env = withCreditLineage();
  upgradePairs.forEach(([addressKey, hashKey], index) => {
    env[addressKey] = "0x" + (index + 4).toString(16).repeat(40);
    env[hashKey] = "0x" + (index + 4).toString(16).repeat(64);
    env[addressKey.replace("11155111", "1")] = "mainnet-do-not-export";
    env[hashKey.replace("11155111", "1")] = "mainnet-do-not-export";
  });
  const [web, launch] = stagingEnvironments(env);
  for (const keys of upgradePairs) for (const key of keys) {
    assert.equal(web.values[key], env[key]);
    assert.ok(!Object.hasOwn(launch.values, key));
    assert.ok(!Object.hasOwn(web.values, key.replace("11155111", "1")));
  }
  assert.deepEqual(parseEnv(serializeStagingEnvironment(web.values)), web.values);
  assert.ok(!serializeStagingEnvironment(web.values).includes("mainnet-do-not-export"));
});

for (const [addressKey, hashKey] of upgradePairs) {
  test(`${addressKey} is independently paired and validated`, () => {
    const env = withCreditLineage();
    env[addressKey] = "0x" + "44".repeat(20);
    env[hashKey] = "0x" + "55".repeat(32);
    for (const key of [addressKey, hashKey]) {
      const unpaired = { ...env }; delete unpaired[key];
      assert.throws(() => stagingEnvironments(unpaired, "web"), /Set both/);
    }
    for (const [key, value] of [[addressKey, "bad"], [addressKey, "0x" + "00".repeat(20)], [hashKey, "bad"], [hashKey, "0x" + "00".repeat(32)]]) {
      assert.throws(() => stagingEnvironments({ ...env, [key]: value }, "web"), /nonzero/);
    }
  });
}

test("upgrade pins remain optional and are not inferred from older factories or registries", () => {
  const env = fixture();
  env.AFFILIATE_TRUSTED_FACTORY_V5_11155111 = "0x" + "11".repeat(20);
  env.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V5_11155111 = "0x" + "22".repeat(32);
  env.AFFILIATE_ELIGIBILITY_ADDRESS_11155111 = "0x" + "33".repeat(20);
  env.AFFILIATE_ELIGIBILITY_CODEHASH_11155111 = "0x" + "44".repeat(32);
  const values = stagingEnvironments(env, "web")[0].values;
  for (const keys of upgradePairs) for (const key of keys) assert.ok(!Object.hasOwn(values, key));
});

test("credit predecessor and ancestor require a complete, distinct registry lineage", () => {
  const env = withCreditLineage();
  const noCurrent = { ...env };
  delete noCurrent.WINNER_CREDITS_ADDRESS_11155111;
  delete noCurrent.WINNER_CREDITS_CODEHASH_11155111;
  assert.throws(() => stagingEnvironments(noCurrent), /Previous.*require.*current/);
  const noPrevious = { ...env };
  delete noPrevious.WINNER_CREDITS_PREVIOUS_ADDRESS_11155111;
  delete noPrevious.WINNER_CREDITS_PREVIOUS_CODEHASH_11155111;
  assert.throws(() => stagingEnvironments(noPrevious), /Ancestor.*require.*previous/);
  for (const key of ["WINNER_CREDITS_PREVIOUS_ADDRESS_11155111", "WINNER_CREDITS_ANCESTOR_ADDRESS_11155111"]) {
    assert.throws(() => stagingEnvironments({ ...env, [key]: env.WINNER_CREDITS_ADDRESS_11155111 }), /must be distinct/);
  }
  const noAncestor = { ...env };
  delete noAncestor.WINNER_CREDITS_ANCESTOR_ADDRESS_11155111;
  delete noAncestor.WINNER_CREDITS_ANCESTOR_CODEHASH_11155111;
  assert.equal(stagingEnvironments(noAncestor, "web")[0].values.WINNER_CREDITS_PREVIOUS_ADDRESS_11155111, env.WINNER_CREDITS_PREVIOUS_ADDRESS_11155111);
});


test("V10 exports preserve independent factory/eligibility pins and the complete four-predecessor credits lineage", () => {
  const env = withCreditLineage();
  for (const [prefix,letter] of [["WINNER_CREDITS_ANCESTOR_2","44"],["WINNER_CREDITS_ANCESTOR_3","55"],["AFFILIATE_ELIGIBILITY_V5","66"]]) {
    env[`${prefix}_ADDRESS_11155111`] = "0x" + letter.repeat(20);
    env[`${prefix}_CODEHASH_11155111`] = "0x" + letter.repeat(32);
  }
  env.AFFILIATE_TRUSTED_FACTORY_V10_11155111="0x"+"77".repeat(20);
  env.AFFILIATE_TRUSTED_FACTORY_CODEHASH_V10_11155111="0x"+"78".repeat(32);
  const [web,launch]=stagingEnvironments(env);
  assert.equal(web.values.AFFILIATE_TRUSTED_FACTORY_V10_11155111,env.AFFILIATE_TRUSTED_FACTORY_V10_11155111);
  assert.equal(web.values.AFFILIATE_ELIGIBILITY_V5_ADDRESS_11155111,env.AFFILIATE_ELIGIBILITY_V5_ADDRESS_11155111);
  assert.equal(web.values.WINNER_CREDITS_ANCESTOR_3_ADDRESS_11155111,env.WINNER_CREDITS_ANCESTOR_3_ADDRESS_11155111);
  assert.equal(launch.values.WINNER_CREDITS_ANCESTOR_3_ADDRESS_11155111,undefined);
  const incomplete={...env};delete incomplete.WINNER_CREDITS_ANCESTOR_2_ADDRESS_11155111;delete incomplete.WINNER_CREDITS_ANCESTOR_2_CODEHASH_11155111;
  assert.throws(()=>stagingEnvironments(incomplete),/complete preceding lineage/);
  assert.throws(()=>stagingEnvironments({...env,WINNER_CREDITS_ANCESTOR_3_ADDRESS_11155111:env.WINNER_CREDITS_ADDRESS_11155111}),/distinct/);
});
