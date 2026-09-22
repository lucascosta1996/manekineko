import { readFile, open, lstat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAddress, Wallet, ZeroAddress } from "ethers";

const root = new URL("../", import.meta.url);
class StagingEnvironmentError extends Error {}
const fail = (message) => { throw new StagingEnvironmentError(message); };

function exportOptionalPins(env, values, addressKey, hashKey, pairLabel, invalidMessage) {
  if (Boolean(env[addressKey]) !== Boolean(env[hashKey])) fail(`Set both ${pairLabel} pins, or neither before deployment.`);
  if (!env[addressKey]) return false;
  try {
    if (getAddress(env[addressKey]) === ZeroAddress || !/^0x[0-9a-fA-F]{64}$/.test(env[hashKey]) || /^0x0{64}$/i.test(env[hashKey])) throw new Error();
  } catch { fail(invalidMessage); }
  values[addressKey] = env[addressKey]; values[hashKey] = env[hashKey];
  return true;
}

/** Pure validation: imports never read local secret files or export credentials. */
export function stagingEnvironments(env, app) {
  if (app !== undefined && !["web", "launch"].includes(app)) fail("Choose the web or launch staging application.");
  if (env.MANEKINEKO_CHAIN_ID !== "11155111") fail("Staging must use MANEKINEKO_CHAIN_ID=11155111.");
  const host = env.STAGING_DATABASE_EXPECTED_HOST;
  const databaseName = env.STAGING_DATABASE_EXPECTED_NAME;
  if (typeof host !== "string" || !host.includes(".") || /localhost|\.local$|\.internal$|^\[|^[\d.]+$/i.test(host)) fail("Pin the isolated remote staging database hostname.");
  if (typeof databaseName !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(databaseName) || ["postgres", "template0", "template1"].includes(databaseName)) fail("Choose a dedicated staging database name.");
  const targets = app ? [app] : ["web", "launch"];
  const outputs = [];
  for (const target of targets) {
    const mapping = target === "web" ? {
      MANEKINEKO_CHAIN_ID: "MANEKINEKO_CHAIN_ID", DATABASE_URL: "WEB_DATABASE_URL",
      AFFILIATE_PUBLIC_ORIGIN: "AFFILIATE_PUBLIC_ORIGIN", AFFILIATE_TRUSTED_PROXY: "AFFILIATE_TRUSTED_PROXY",
      AFFILIATE_IP_HASH_SECRET: "AFFILIATE_IP_HASH_SECRET", AFFILIATE_ENROLLMENT_PRIVATE_KEY: "AFFILIATE_ENROLLMENT_PRIVATE_KEY",
      TURNSTILE_SECRET_KEY: "TURNSTILE_SECRET_KEY", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      AFFILIATE_RPC_URL_11155111: "AFFILIATE_RPC_URL_11155111",
    } : {
      MANEKINEKO_CHAIN_ID: "MANEKINEKO_CHAIN_ID", DATABASE_URL: "LAUNCH_DATABASE_URL",
      LAUNCH_PUBLIC_ORIGIN: "LAUNCH_PUBLIC_ORIGIN", LAUNCH_RATE_LIMIT_SECRET: "LAUNCH_RATE_LIMIT_SECRET",
    };
    const missing = Object.values(mapping).filter((key) => typeof env[key] !== "string" || !env[key]);
    if (missing.length) fail(`${target}: missing ${missing.join(", ")}.`);
    const origin = new URL(env[target === "web" ? "AFFILIATE_PUBLIC_ORIGIN" : "LAUNCH_PUBLIC_ORIGIN"]);
    if (origin.protocol !== "https:" || origin.origin !== origin.href.replace(/\/$/, "") || origin.username || origin.password) fail(`${target}: configure an exact HTTPS origin.`);
    const database = new URL(env[mapping.DATABASE_URL]);
    if (!["postgres:", "postgresql:"].includes(database.protocol) || database.hostname.toLowerCase() !== host.toLowerCase() || decodeURIComponent(database.pathname.slice(1)) !== databaseName || database.hash) fail(`${target}: database must match the isolated staging target.`);
    const parameters = [...database.searchParams.keys()];
    if (database.searchParams.get("sslmode") !== "verify-full" || parameters.some(key => !["sslmode", "channel_binding"].includes(key)) || new Set(parameters).size !== parameters.length || (database.searchParams.has("channel_binding") && database.searchParams.get("channel_binding") !== "require")) fail(`${target}: database requires sslmode=verify-full without endpoint, credential or SQL overrides.`);
    if (decodeURIComponent(database.username) !== `manekineko_staging_${target}`) fail(`${target}: use its dedicated runtime database role.`);
    if (!/^[\x21-\x7e]{24,}$/.test(decodeURIComponent(database.password))) fail(`${target}: use a runtime database password of at least 24 printable characters.`);
    const secret = env[target === "web" ? "AFFILIATE_IP_HASH_SECRET" : "LAUNCH_RATE_LIMIT_SECRET"];
    if (secret.length < 32) fail(`${target}: generate a server secret of at least 32 characters.`);
    if (target === "web") {
      if (env.AFFILIATE_TRUSTED_PROXY !== "vercel") fail("Web admission requires the actual Vercel edge.");
      try { new Wallet(env.AFFILIATE_ENROLLMENT_PRIVATE_KEY); }
      catch { fail("Invalid dedicated enrollment signer key."); }
      if (["DEPLOYER_PRIVATE_KEY", "SEPOLIA_PRIVATE_KEY", "MAINNET_PRIVATE_KEY", "OWNER_PRIVATE_KEY"].some(key => env[key]?.toLowerCase() === env.AFFILIATE_ENROLLMENT_PRIVATE_KEY.toLowerCase())) fail("Enrollment must use a separate unfunded signer, not an owner or deployer key.");
      if (/^[123]x0{10,}/.test(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) || /^[123]x0{10,}/.test(env.TURNSTILE_SECRET_KEY)) fail("Use real Turnstile keys, not testing keys.");
      const rpc = new URL(env.AFFILIATE_RPC_URL_11155111);
      if (rpc.protocol !== "https:" || rpc.hash) fail("Sepolia RPC must use HTTPS without a fragment.");
    }
    // This explicit allowlist excludes admin credentials, owner keys and passwords.
    const values = Object.fromEntries(Object.entries(mapping).map(([key, source]) => [key, env[source]]));
    if (target === "web") {
      for (const version of ["V5", "V6", "V7", "V8", "V9", "V10"]) {
        const [addressKey, hashKey] = [`AFFILIATE_TRUSTED_FACTORY_${version}_11155111`, `AFFILIATE_TRUSTED_FACTORY_CODEHASH_${version}_11155111`];
        exportOptionalPins(env, values, addressKey, hashKey, `verified ${version} trust`, `Use a nonzero ${version} factory address and its verified runtime code hash.`);
      }
      const creditPins = ["", "PREVIOUS_", "ANCESTOR_", "ANCESTOR_2_", "ANCESTOR_3_"].map((prefix) => {
        const addressKey = `WINNER_CREDITS_${prefix}ADDRESS_11155111`;
        const label = prefix ? `${prefix.slice(0, -1).toLowerCase()} winner credit registry` : "winner credit registry";
        const present = exportOptionalPins(env, values, addressKey, `WINNER_CREDITS_${prefix}CODEHASH_11155111`, `canonical ${label}`, `Use a nonzero ${label} address and verified runtime hash.`);
        return { present, addressKey };
      });
      if (creditPins[1].present && !creditPins[0].present) fail("Previous winner credit registry pins require the current canonical registry pins.");
      if (creditPins[2].present && !creditPins[1].present) fail("Ancestor winner credit registry pins require previous and current canonical registry pins.");
      for (let depth = 3; depth < creditPins.length; depth++) if (creditPins[depth].present && !creditPins[depth - 1].present) fail("Winner credit ancestor pins require the complete preceding lineage.");
      const lineageAddresses = creditPins.filter(({ present }) => present).map(({ addressKey }) => getAddress(values[addressKey]));
      if (new Set(lineageAddresses).size !== lineageAddresses.length) fail("Winner credit registry lineage addresses must be distinct.");
      for (const version of ["", "V2_", "V3_", "V4_", "V5_"]) {
        const label = version ? `affiliate eligibility ${version.slice(0, -1)}` : "affiliate eligibility";
        exportOptionalPins(env, values, `AFFILIATE_ELIGIBILITY_${version}ADDRESS_11155111`, `AFFILIATE_ELIGIBILITY_${version}CODEHASH_11155111`, `canonical ${label}`, `Use a nonzero ${label} registry address and verified runtime hash.`);
      }
    }
    // Keep generated dotenv files literal across Node and Next's dotenv-expand.
    // URL-encode special characters inside URL credentials before configuration.
    if (Object.values(values).some(value => /[\r\n\u0000$]/.test(value))) fail(`${target}: use single-line literal values without dollar expansion; URL-encode special URL credentials.`);
    serializeStagingEnvironment(values);
    outputs.push({ target, values });
  }
  if (outputs.length === 2) {
    const web = new URL(outputs[0].values.DATABASE_URL), launch = new URL(outputs[1].values.DATABASE_URL);
    if ((web.port || "5432") !== (launch.port || "5432") || decodeURIComponent(web.password) === decodeURIComponent(launch.password)) fail("Web and launch require the same staging endpoint port and distinct runtime passwords.");
    if (env.AFFILIATE_PUBLIC_ORIGIN.replace(/\/$/, "") === env.LAUNCH_PUBLIC_ORIGIN.replace(/\/$/, "")) fail("Web and launch require separate staging origins.");
  }
  return outputs;
}

export function serializeStagingEnvironment(values) {
  const content = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n";
  const parsed = parseEnv(content);
  if (Object.entries(values).some(([key, value]) => parsed[key] !== value)) fail("Staging values cannot be safely represented in a dotenv export.");
  return content;
}

export async function runStagingEnvironment(args = process.argv.slice(2)) {
  const [mode, app, ...extra] = args;
  if (!["check", "export"].includes(mode) || extra.length || (app && !["web", "launch"].includes(app))) fail("Usage: node scripts/staging-environment.mjs check|export [web|launch]");
  const envPath = new URL(".env.staging.local", root);
  const stat = await lstat(envPath);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail(".env.staging.local must be a private regular file (chmod 600).");
  const env = parseEnv(await readFile(envPath, "utf8"));
  const outputs = stagingEnvironments(env, app);
  for (const { target, values } of outputs) {
    if (mode === "export") {
      const destination = new URL(`.env.staging.${target}.local`, root);
      const file = await open(destination, "wx", 0o600);
      try { await file.writeFile(serializeStagingEnvironment(values)); await file.sync(); }
      finally { await file.close(); }
      console.log(`${target}: private environment export created at ${fileURLToPath(destination)}.`);
    } else console.log(`${target}: staging environment shape is valid (connectivity and provider verification are separate checks).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runStagingEnvironment(); }
  catch (error) {
    // Never print raw URLs, keys, database errors or file contents.
    const message = error?.code === "ENOENT" ? "Create private .env.staging.local from .env.staging.example first."
      : error?.code === "EEXIST" ? "The private export already exists; review it before replacing it."
      : error instanceof StagingEnvironmentError ? error.message : "Invalid value or inaccessible file in staging configuration.";
    console.error(message);
    process.exitCode = 1;
  }
}
