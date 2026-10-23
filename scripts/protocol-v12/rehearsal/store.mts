import { constants } from 'node:fs';
import { open, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Wallet } from 'ethers';
const aad = Buffer.from('tincta:v12:sepolia:100-wallets:v1');
export async function privateRead(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await file.stat();
    if (!s.isFile() || (s.mode & 0o077) || (process.getuid && s.uid !== process.getuid())) throw new Error('Runtime state must be owned private files (mode 600).');
    return await file.readFile('utf8');
  } finally { await file.close(); }
}
export async function durable(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + '.tmp', file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(JSON.stringify(data, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(temp, path);
  const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); }
}
export async function exclusive(path: string) {
  const lock = await open(path, 'wx', 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); await lock.sync();
  return async () => { await lock.close(); await unlink(path); };
}
function key(secret: string) {
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error('V12_REHEARSAL_VAULT_KEY must be 32 random bytes encoded as hex.');
  return Buffer.from(secret, 'hex');
}
export async function createVault(path: string, secret: string) {
  const k = key(secret), wallets = Array.from({ length: 100 }, () => new Wallet(Wallet.createRandom().privateKey));
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', k, iv); cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(wallets.map(w => w.privateKey))), cipher.final()]);
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify({ version: 1, chainId: 11155111, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') })); await file.sync(); }
  finally { k.fill(0); await file.close(); }
  return wallets;
}
export async function readVault(path: string, secret: string) {
  const k = key(secret);
  try {
    const data = JSON.parse(await privateRead(path));
    if (data.version !== 1 || data.chainId !== 11155111) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(data.iv, 'hex')); decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
    const keys = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'hex')), decipher.final()]).toString('utf8'));
    if (!Array.isArray(keys) || keys.length !== 100) throw new Error();
    const wallets = keys.map((value: string) => new Wallet(value));
    if (new Set(wallets.map(w => w.address)).size !== 100) throw new Error();
    return wallets;
  } catch { throw new Error('Vault authentication failed. Preserve the vault and use its original key.'); }
  finally { k.fill(0); }
}
