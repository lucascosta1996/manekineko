import assert from "node:assert/strict";
import { test } from "node:test";
import { forgetWalletSelection, rememberWalletSelection, restoreWalletSelection } from "../../../packages/protocol/src/wallet-selection.ts";

const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222";
function fixture() {
  const values = new Map<string, string>(), calls: string[] = [], selected: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let authorized = [A, B], chain = "0xaa36a7";
  const live = { connectorId: "metamask", address: A, chainId: 11155111,
    provider: { request: async ({ method }: { method: string }) => { calls.push(method); if (method === "eth_accounts") return authorized; if (method === "eth_chainId") return chain; throw new Error("Unexpected wallet request"); } },
    isCurrent: () => true, select: async (address: string) => { selected.push(address); },
  };
  const remember = () => rememberWalletSelection(storage, { connectorId: live.connectorId, address: B, chainId: live.chainId }, [A, B]);
  return { values, storage, live, calls, selected, remember, authorize: (next: string[]) => { authorized = next; }, network: (next: string) => { chain = next; } };
}

test("a secondary account survives page navigation through the SDK without requesting wallet permissions", async () => {
  const f = fixture(); f.remember();
  await restoreWalletSelection(f.storage, f.live);
  assert.deepEqual(f.selected, [B]);
  assert.deepEqual(f.calls.sort(), ["eth_accounts", "eth_chainId"]);
  f.live.address = B;
  await restoreWalletSelection(f.storage, f.live);
  assert.deepEqual(f.selected, [B], "an already selected account does not trigger a switch loop");
});

test("extension account switching, revocation and network changes override the app preference", async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => f.authorize([B, A]), (f: ReturnType<typeof fixture>) => f.authorize([A]), (f: ReturnType<typeof fixture>) => f.authorize([]), (f: ReturnType<typeof fixture>) => f.network("0x1")]) {
    const f = fixture(); f.remember(); change(f);
    await restoreWalletSelection(f.storage, f.live);
    assert.deepEqual(f.selected, []); assert.equal(f.values.size, 0);
  }
});

test("a saved selection cannot cross connector identities or authorize an unconnected account", async () => {
  const f = fixture(); f.remember(); f.live.connectorId = "different-wallet";
  await restoreWalletSelection(f.storage, f.live);
  assert.equal(f.values.size, 0); assert.deepEqual(f.calls, []);
  rememberWalletSelection(f.storage, { connectorId: "metamask", address: B, chainId: 11155111 }, [A]);
  assert.equal(f.values.size, 0);
});

test("a provider event during restoration cancels the old preference before SDK selection", async () => {
  const f = fixture(); f.remember();
  const request = f.live.provider.request;
  f.live.provider.request = async input => { const answer = await request(input); forgetWalletSelection(f.storage); return answer; };
  await restoreWalletSelection(f.storage, f.live);
  assert.deepEqual(f.selected, []);
  f.remember(); f.live.isCurrent = () => false;
  await restoreWalletSelection(f.storage, f.live);
  assert.deepEqual(f.selected, []);
});

test("malformed or unavailable preference storage cannot prevent ordinary wallet use", async () => {
  const f = fixture(); f.remember();
  const key = [...f.values.keys()][0]; f.values.set(key, "invalid JSON");
  await restoreWalletSelection(f.storage, f.live);
  assert.equal(f.values.size, 0);
  const blocked = { getItem: () => { throw new Error("Storage blocked"); }, setItem: () => { throw new Error("Storage blocked"); }, removeItem: () => { throw new Error("Storage blocked"); } };
  rememberWalletSelection(blocked, { connectorId: "metamask", address: B, chainId: 11155111 }, [A, B]);
  await restoreWalletSelection(blocked, f.live); forgetWalletSelection(blocked);
  assert.deepEqual(f.selected, []);
});
