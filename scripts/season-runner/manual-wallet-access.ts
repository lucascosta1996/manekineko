import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Contract, JsonRpcProvider, keccak256, type Wallet } from "ethers";
import type { ManualRehearsalReservation } from "./sepolia-wallets.ts";

export type ManualRole = "affiliate" | "buyer" | "winner";
export function manualRoleAddress(chainId: number, reservation: ManualRehearsalReservation, role: ManualRole) {
  if (chainId !== 11155111) throw new Error("manual_wallet_access_is_sepolia_only");
  const address = role === "winner" ? reservation.winner?.address : reservation[role];
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("manual_role_not_yet_reserved");
  if (role === "winner" && reservation.checkpoint === "complete") throw new Error("manual_winner_prize_already_paid");
  return address;
}

/** Export exactly one reserved account as an encrypted standard JSON keystore.
 * This function never prints, returns or persists a plaintext private key. */
export async function exportManualWallet(options: { chainId: number; reservation: ManualRehearsalReservation; role: ManualRole; wallets: Wallet[]; password: string; directory: string; runId: string }) {
  const address = manualRoleAddress(options.chainId, options.reservation, options.role);
  const output = await exportSelectedSepoliaWallet({...options,address});
  return { ...output, runId: options.runId, collectionId: options.reservation.collectionId,
    ...(options.role === "winner" ? { tokenId: options.reservation.winner!.tokenId, rank: options.reservation.winner!.rank } : {}) };
}

/** Selected historical account access does not imply an unpaid prize or a future winner. */
export async function exportSelectedSepoliaWallet(options: { chainId: number; address: string; role: ManualRole; wallets: Wallet[]; password: string; directory: string }) {
  if (options.chainId !== 11155111 || !["affiliate", "buyer", "winner"].includes(options.role)) throw new Error("manual_wallet_access_is_sepolia_only");
  const address = options.address;
  if (options.password.length < 16 || options.password.length > 1000) throw new Error("export_password_requires_16_or_more_characters");
  const wallet = options.wallets.find(item => item.address.toLowerCase() === address.toLowerCase());
  if (!wallet) throw new Error("reserved_role_missing_from_original_vault");
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = await parent.stat();
    if (!stat.isDirectory() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) throw new Error("wallet_export_directory_requires_owned_mode_700");
    const encrypted = await wallet.encrypt(options.password);
    const output = join(directory, `${options.role}-${address.toLowerCase()}.json`);
    const file = await open(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(encrypted); await file.sync(); } finally { await file.close(); }
    await parent.sync();
    return { chainId: 11155111, role: options.role, address, path: output };
  } finally { await parent.close(); }
}

export function parseManualAccessArguments(args: string[]) {
  const values: Record<string, string> = {}, envFiles: string[] = [];
  let execute = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--execute" && !execute) { execute = true; continue; }
    if (!["--chain", "--run-id", "--round", "--role", "--wallet-vault", "--password-file", "--output-directory", "--env-file"].includes(flag)) throw new Error("invalid_manual_access_option");
    const value = args[++index];
    if (!value || value.startsWith("--") || flag !== "--env-file" && values[flag]) throw new Error("invalid_manual_access_option");
    if (flag === "--env-file") envFiles.push(value); else values[flag] = value;
  }
  // Validate chain before loading environment, service clients or the vault.
  if (values["--chain"] !== "11155111") throw new Error("manual_wallet_access_is_sepolia_only");
  if (!/^[0-9a-f-]{36}$/i.test(values["--run-id"] ?? "") || !/^0x[0-9a-f]{40}$/i.test(values["--round"] ?? "") || !["affiliate", "buyer", "winner"].includes(values["--role"])) throw new Error("manual_access_requires_run_round_and_role");
  if (execute && ["--wallet-vault", "--password-file", "--output-directory"].some(key => !values[key])) throw new Error("manual_export_requires_private_destination_password_and_vault");
  return { values, envFiles, execute };
}

async function main() {
  const args = parseManualAccessArguments(process.argv.slice(2));
  const [{ loadPrivateEnvironment, connectionConfig, readPrivateFile }, { openRunStore }, { default: pg }] = await Promise.all([import("./config.ts"), import("./store.ts"), import("pg")]);
  await loadPrivateEnvironment(args.envFiles);
  const config = connectionConfig(11155111, false);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  const provider = new JsonRpcProvider(config.rpcUrl);
  let store: Awaited<ReturnType<typeof openRunStore>> | undefined;
  try {
    store = await openRunStore(pool, args.values["--run-id"], 11155111, false);
    const round = args.values["--round"].toLowerCase(), reservation = store.state.rehearsal?.manual?.[round] as ManualRehearsalReservation | undefined;
    const deployment = Object.values(store.state.collections ?? {}).find((item: any) => item.deployment?.round?.toLowerCase() === round) as { deployment: { roundCodeHash: string } } | undefined;
    if (!reservation || !deployment) throw new Error("no_saved_manual_reservation_for_run_and_round");
    const role = args.values["--role"] as ManualRole, address = manualRoleAddress(11155111, reservation, role);
    if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error("manual_access_rpc_network_mismatch");
    const head = await provider.getBlock("latest"), block = head && await provider.getBlock(head.number - config.confirmations + 1);
    if (!block?.hash || !head || Math.abs(Date.now() / 1000 - head.timestamp) > 180 || keccak256(await provider.getCode(round, block.number)) !== deployment.deployment.roundCodeHash) throw new Error("manual_access_requires_fresh_verified_runtime");
    const contract = new Contract(round, ["function CONTRACT_VERSION() view returns(string)", "function revealed() view returns(bool)", "function winningTokenIds(uint256) view returns(uint256)", "function prizeClaimed(uint256) view returns(bool)", "function ownerOf(uint256) view returns(address)"], provider), at = { blockTag: block.number };
    if (await contract.CONTRACT_VERSION(at) !== "affiliate-v10") throw new Error("manual_access_requires_v10");
    if (role === "winner" && (!await contract.revealed(at) || await contract.prizeClaimed(reservation.winner!.rank, at) || String(await contract.winningTokenIds(reservation.winner!.rank, at)) !== reservation.winner!.tokenId || (await contract.ownerOf(reservation.winner!.tokenId, at)).toLowerCase() !== address.toLowerCase())) throw new Error("manual_winner_requires_current_unpaid_rights");
    if ((await provider.getBlock(block.number))?.hash !== block.hash) throw new Error("manual_access_observation_reorganized");
    const sheet = { mode: args.execute ? "local-encrypted-export" : "read-only", runId: store.row.id, round, chainId: 11155111, collectionId: reservation.collectionId, role, address, reservation, observation: { blockNumber: block.number, blockHash: block.hash } };
    if (!args.execute) { process.stdout.write(`${JSON.stringify(sheet)}\n`); return; }
    const { ensureSepoliaWallets } = await import("./sepolia-wallets.ts");
    const master = process.env.SEASON_RUNNER_MASTER_KEY ?? "";
    if (!/^[A-Za-z0-9+/]{43}=$/.test(master)) throw new Error("shared_master_key_required");
    const wallets = await ensureSepoliaWallets({ chainId: 11155111, path: args.values["--wallet-vault"], masterKey: Buffer.from(master, "base64").toString("hex"), create: false });
    const password = (await readPrivateFile(args.values["--password-file"]))!.trimEnd();
    const output = await exportManualWallet({ chainId: 11155111, reservation, role, wallets, password, directory: args.values["--output-directory"], runId: store.row.id });
    process.stdout.write(`${JSON.stringify({ ...sheet, export: output })}\n`);
  } finally { await store?.close(); provider.destroy(); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => {
  process.stderr.write("manual_wallet_access_failed_review_private_inputs_and_reservations\n"); process.exitCode = 1;
});
