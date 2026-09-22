import { randomBytes, randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import pg from "pg";
import { hashLaunchPassword, normalizedLaunchUsername } from "../apps/launch/lib/launch-auth-policy.ts";

// Passwords must never appear in argv, shell history, application logs, or the database in plaintext.
const args = process.argv.slice(2);
const operation = args.shift();
const options = new Map();
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (!["--username", "--credential-file", "--password-stdin"].includes(key) || options.has(key)) throw new Error("Unknown or duplicate account option.");
  if (key === "--password-stdin") options.set(key, true);
  else {
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`A value is required for ${key}.`);
    options.set(key, value);
  }
}

let credentialPath;
let wroteCredentials = false;
let committed = false;
let client;
try {
  if (!["create", "reset"].includes(operation) || !process.env.DATABASE_URL) {
    throw new Error("Use launch:account -- create|reset --username operator --credential-file .env.launch-credentials.local, or --password-stdin. Configure DATABASE_URL first.");
  }
  if (options.has("--credential-file") === options.has("--password-stdin")) throw new Error("Choose exactly one of --credential-file and --password-stdin.");
  const username = normalizedLaunchUsername(options.get("--username") ?? "operator");
  let password;
  if (options.has("--credential-file")) {
    credentialPath = resolve(options.get("--credential-file"));
    const name = basename(credentialPath);
    if (!name.startsWith(".env.") || name === ".env.example") throw new Error("The credential file must use an ignored .env.* filename, excluding .env.example.");
    password = randomBytes(32).toString("base64url");
    // Exclusive creation avoids overwriting credentials or following an existing symlink.
    const file = await open(credentialPath, "wx", 0o600);
    wroteCredentials = true;
    try {
      await file.writeFile(`# Private launch-console credentials. Import into a password manager, then remove this file.\nLAUNCH_USERNAME=${username}\nLAUNCH_PASSWORD=${password}\n`);
      await file.sync();
    } finally { await file.close(); }
  } else {
    if (process.stdin.isTTY) throw new Error("Supply the password through secure standard input, or use --credential-file to generate one.");
    const parts = [];
    let size = 0;
    for await (const part of process.stdin) {
      size += part.length;
      if (size > 1_024) throw new Error("The password input is too large.");
      parts.push(part);
    }
    password = Buffer.concat(parts).toString("utf8").replace(/\r?\n$/, "");
  }
  const hash = await hashLaunchPassword(password);
  password = "";
  client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, application_name: "manekineko-launch-account" });
  await client.connect();
  await client.query("BEGIN");
  if (operation === "create") {
    const result = await client.query("INSERT INTO manekineko_launch_users(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id", [randomUUID(), username, hash]);
    if (!result.rowCount) throw new Error("This account already exists. Use the explicit reset operation to replace its password.");
  } else {
    const result = await client.query("UPDATE manekineko_launch_users SET password_hash=$2,updated_at=now() WHERE username=$1 RETURNING id", [username, hash]);
    if (!result.rowCount) throw new Error("This account does not exist. Use the create operation first.");
    await client.query("DELETE FROM manekineko_launch_sessions WHERE user_id=$1", [result.rows[0].id]);
  }
  await client.query("COMMIT");
  committed = true;
  console.log(`Launch account ${username} ${operation === "create" ? "created" : "password reset; all existing sessions revoked"}.`);
  if (credentialPath) console.log(`Private credentials saved with mode 0600 to ${credentialPath}. Move them to a password manager and remove the file afterward.`);
} catch (error) {
  if (client && !committed) await client.query("ROLLBACK").catch(() => {});
  if (wroteCredentials && !committed && credentialPath) await unlink(credentialPath).catch(() => {});
  // Database errors can contain statement details; never print their original messages.
  console.error(error && typeof error === "object" && "code" in error ? "Launch account operation failed. Check database connectivity, migrations, and account configuration." : error instanceof Error ? error.message : "Launch account operation failed.");
  process.exitCode = 1;
} finally { if (client) await client.end(); }
