import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { privateRead } from '../../protocol-v12/rehearsal/store.mts';
export { privateRead, durable, exclusive } from '../../protocol-v12/rehearsal/store.mts';
const aad = Buffer.from('tincta:v13:sepolia:bank-and-50-buyers:v1');
function key(secret: string) {
  if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error('V13_REHEARSAL_VAULT_KEY must contain 32 random bytes encoded as hex.');
  return Buffer.from(secret, 'hex');
}
export async function createVault(path: string, secret: string) {
  const k = key(secret), wallets = Array.from({ length: 51 }, () => new Wallet(Wallet.createRandom().privateKey));
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
    if (!Array.isArray(keys) || keys.length !== 51) throw new Error();
    const wallets = keys.map((value: string) => new Wallet(value));
    if (new Set(wallets.map(w => w.address)).size !== 51) throw new Error();
    return wallets;
  } catch { throw new Error('Vault authentication failed. Preserve the vault and its original key.'); }
  finally { k.fill(0); }
}
