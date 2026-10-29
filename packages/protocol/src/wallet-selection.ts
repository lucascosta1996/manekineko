import { getAddress } from "ethers";
import type { WalletProvider } from "./wallet.ts";

type SelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
type Choice = { connectorId: string; address: string; chainId: number; accounts: string[] };
const key = "tincta:selected-wallet:v1";

function accounts(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("Invalid wallet permissions");
  return value.map(address => getAddress(address).toLowerCase());
}

export function forgetWalletSelection(storage: SelectionStorage) {
  try { storage?.removeItem(key); } catch { /* A blocked preference store must not block wallet use. */ }
}

/** A tab preference only. Provider permissions remain the source of authority. */
export function rememberWalletSelection(storage: SelectionStorage, choice: Omit<Choice, "accounts">, authorized: unknown) {
  try {
    const snapshot = accounts(authorized), address = getAddress(choice.address).toLowerCase();
    if (!choice.connectorId || ![1, 11155111].includes(choice.chainId) || !snapshot.includes(address)) return;
    storage?.setItem(key, JSON.stringify({ ...choice, address, accounts: snapshot }));
  } catch { /* Account/chain validation still runs before every transaction. */ }
}

/** Restore through the SDK only while the entire ordered permission snapshot is unchanged. */
export async function restoreWalletSelection(storage: SelectionStorage, live: {
  connectorId: string; address: string; chainId: number; provider: WalletProvider;
  isCurrent: () => boolean; select: (address: string) => Promise<void>;
}) {
  let raw: string | null;
  try { raw = storage?.getItem(key) ?? null; } catch { return; }
  if (!raw) return;
  let choice: Choice;
  try {
    choice = JSON.parse(raw);
    choice.accounts = accounts(choice.accounts);
    choice.address = getAddress(choice.address).toLowerCase();
    if (choice.connectorId !== live.connectorId || choice.chainId !== live.chainId || !choice.accounts.includes(choice.address)) throw new Error("Selection changed");
  } catch { forgetWalletSelection(storage); return; }
  const [authorized, chain] = await Promise.all([
    live.provider.request({ method: "eth_accounts" }), live.provider.request({ method: "eth_chainId" }),
  ]);
  // An event or another explicit selection can invalidate this asynchronous read.
  try { if (!live.isCurrent() || storage?.getItem(key) !== raw) return; } catch { return; }
  try {
    if (Number(BigInt(String(chain))) !== choice.chainId || JSON.stringify(accounts(authorized)) !== JSON.stringify(choice.accounts)) throw new Error("Permissions changed");
  } catch { forgetWalletSelection(storage); return; }
  if (live.address.toLowerCase() !== choice.address) await live.select(choice.address);
}
