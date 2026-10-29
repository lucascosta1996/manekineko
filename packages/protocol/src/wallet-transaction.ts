import { AbiCoder, Interface, ZeroHash, getAddress, toQuantity, type Eip1193Provider } from "ethers";

export type WalletIntent = { wallet: string; chainId: number; nonce?: number; to: string; data: string; value: string };
type SubmittedTransaction = { from: string; chainId: bigint; nonce: number; to: string | null; data: string; value: bigint };

/** Let the wallet estimate the transaction it will actually submit, including smart-account execution. */
export async function requestWalletTransaction(provider: Eip1193Provider, intent: WalletIntent): Promise<string> {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{
    from: getAddress(intent.wallet), to: getAddress(intent.to), data: intent.data,
    value: toQuantity(BigInt(intent.value)), chainId: toQuantity(intent.chainId),
    ...(intent.nonce === undefined ? {} : { nonce: toQuantity(intent.nonce) }),
  }] });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("The wallet did not return a transaction hash. Check wallet activity before trying again.");
  return hash;
}

// MetaMask Delegation Framework 1.3.0. Only self-funded, single, atomic calls are supported.
export const delegationManager = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
const wrapper = new Interface(["function redeemDelegations(bytes[] permissionContexts,bytes32[] modes,bytes[] executionCallDatas)"]);
const delegationType = "tuple(address delegate,address delegator,bytes32 authority,tuple(address enforcer,bytes terms,bytes args)[] caveats,uint256 salt,bytes signature)[]";
const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

/** Identity matching only: callers must separately verify receipt success, finality and canonical block. */
export function matchesWalletIntent(tx: SubmittedTransaction, intent: WalletIntent): boolean {
  try {
    if (!same(tx.from, intent.wallet) || tx.chainId !== BigInt(intent.chainId) || intent.nonce !== undefined && tx.nonce !== intent.nonce) return false;
    if (same(tx.to, intent.to)) return same(tx.data, intent.data) && tx.value === BigInt(intent.value);
    if (!same(tx.to, delegationManager) || tx.value !== 0n) return false;
    const [contexts, modes, executions] = wrapper.decodeFunctionData("redeemDelegations", tx.data);
    if (contexts.length !== 1 || modes.length !== 1 || executions.length !== 1 || modes[0] !== ZeroHash) return false;
    const [delegations] = AbiCoder.defaultAbiCoder().decode([delegationType], contexts[0]);
    if (delegations.length > 1) return false;
    if (delegations.length === 1 && (!same(delegations[0].delegate, intent.wallet) || !same(delegations[0].delegator, intent.wallet) || delegations[0].authority !== "0x" + "ff".repeat(32))) return false;
    const call = executions[0];
    return call.length >= 106 && same(call.slice(0, 42), intent.to) && BigInt("0x" + call.slice(42, 106)) === BigInt(intent.value) && same("0x" + call.slice(106), intent.data);
  } catch { return false; }
}
