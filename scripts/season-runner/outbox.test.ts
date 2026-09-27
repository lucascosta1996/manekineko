import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeasonSocialMessage } from "../../packages/contracts/src/season-social.ts";
import { deliverPost, deliverMessage, SocialContentExpired, MediaPending } from "./outbox.ts";
import { AmbiguousDelivery } from "./social.ts";
import type { Action } from "./store.ts";

const credentials = { apiKey: "key", apiKeySecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" };
const account = { id: "12345", username: "test", name: "Test" };
const baseTime = Date.UTC(2035, 0, 1);
const response = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
function memoryStore() {
  const actions = new Map<string, Action>();
  const store = {
    actions, updates: [] as string[], failConfirmed: false,
    action: async (key: string) => actions.get(key),
    putAction: async (key: string, kind: string, payload: Record<string, any>) => {
      const item: Action = { id: key, action_key: key, kind, status: "pending", payload, result: {}, last_error: null };
      if (!actions.has(key)) actions.set(key, item); return actions.get(key)!;
    },
    updateAction: async (key: string, status: string, result: Record<string, any>, error: string | null = null) => {
      if (status === "confirmed" && store.failConfirmed) throw new Error("simulated database interruption");
      const item = actions.get(key)!; item.status = status; item.result = structuredClone(result); item.last_error = error; store.updates.push(status);
    },
    replacePendingAction: async (key: string, payload: Record<string, any>) => {
      const item = actions.get(key)!;
      assert(["pending", "failed"].includes(item.status));
      const previous = structuredClone({ payload: item.payload, result: item.result, status: item.status });
      item.payload = payload; item.status = "pending"; item.result = { observation: item.result.observation, payloadHistory: [...(item.result.payloadHistory ?? []), previous] }; return item;
    },
    guard: async () => ({ profile_revision: 1, status: "running" }), event: async () => {},
  };
  return store;
}
function message(now: number) {
  return buildSeasonSocialMessage({ event: "affiliate-opening-soon", chainId: 11155111,
    season: { id: `0x${"1".repeat(64)}`, number: 1, name: "Test Season", colors: ["#123456"] },
    collection: { id: "collection", number: 1, name: "Test Collection", color: "#123456", supply: 1000, mintPriceEth: "0.01", winnerCount: 6, prizePerWinnerEth: "1" },
    now: new Date(now).toISOString(), enrollmentOpensAt: new Date(baseTime + 3_600_000).toISOString(), urls: { docs: "https://tincta.xyz/docs" },
  });
}
test("ambiguous writes remain uncertain and never send again on resume", async () => {
  const store = memoryStore(); let writes = 0;
  const fetch: typeof globalThis.fetch = async url => {
    if (String(url).endsWith("/users/me")) return response({ data: account });
    writes++; throw new Error("timeout after acceptance");
  };
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "One announcement" }, { fetch }), AmbiguousDelivery);
  assert.equal(store.actions.get("root")!.status, "uncertain");
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "Changed text" }, { fetch }), /reconciliation/);
  assert.equal(writes, 1); assert.equal(store.actions.get("root")!.payload.text, "One announcement");
});

test("draw intent is durable without any media/public writes, and delayed all-paid copy retains earlier observation", async () => {
  const store = memoryStore(); let posts = 0;
  const observation = { observedAt: new Date(baseTime).toISOString(), blockNumber: 12, blockHash: `0x${"ab".repeat(32)}`, unpaidPrizes: 2 };
  const input = { event: "winners-revealed" as const, drawVerified: true, chainId: 11155111 as const,
    season: { id: `0x${"1".repeat(64)}`, number: 1, name: "Test Season", colors: ["#123456"] },
    collection: { id: "collection", number: 1, name: "Test Collection", color: "#123456", supply: 1000, mintPriceEth: "0.01", winnerCount: 2, prizePerWinnerEth: "1" },
    now: new Date(baseTime).toISOString(), urls: { prizeClaim: "https://tincta.xyz/mint/collection" },
    winners: [1, 2].map(rank => ({ rank, tokenId: String(rank), awardEth: "1", holderWallet: `0x${"1".repeat(40)}`, holderBlock: "12", nftUrl: `https://tincta.xyz/nfts/collection/${rank}`, claimed: false })) };
  const queued = buildSeasonSocialMessage(input);
  await deliverMessage(store, credentials, account.id, "draw", queued, { enqueueOnly: true, observation, fetch: async () => { throw new Error("must not send"); } });
  assert.equal(store.actions.get("draw:root")!.status, "pending");
  assert.equal(store.actions.size, 1);
  const fresh = buildSeasonSocialMessage({ ...input, now: new Date(baseTime + 9000).toISOString(), winners: input.winners.map(winner => ({ ...winner, claimed: true })) });
  const fetch: typeof globalThis.fetch = async (url, request) => {
    if (String(url).endsWith("/users/me")) return response({ data: account });
    if (String(url).endsWith("/media/upload")) return response({ data: { id: "222", expires_after_secs: 86400 } });
    if (String(url).endsWith("/media/metadata")) return response({ data: { id: "222" } });
    if (posts++ === 0) { assert.match(JSON.parse(String(request?.body)).text, /All prizes have been paid/); assert.doesNotMatch(JSON.parse(String(request?.body)).text, /claim unpaid|claim link/); }
    return response({ data: { id: String(333 + posts) } }, 201);
  };
  await deliverMessage(store, credentials, account.id, "draw", fresh, { fetch, observation: { ...observation, unpaidPrizes: 0 }, now: () => baseTime + 9000 });
  const result = store.actions.get("draw:root")!.result;
  assert.deepEqual(result.observation, observation);
  assert.equal(result.observationToDeliveryMs, 9000);
  assert.equal(result.payloadHistory.length, 1);
  assert.match(result.payloadHistory[0].payload.text, /claim unpaid prizes/);
  const writes = posts;
  await deliverMessage(store, credentials, account.id, "draw", fresh, { fetch });
  assert.equal(posts, writes);
});
test("a crash after X accepts but before persistence never becomes a duplicate", async () => {
  const store = memoryStore(); store.failConfirmed = true; let writes = 0;
  const fetch: typeof globalThis.fetch = async url => String(url).endsWith("/users/me") ? response({ data: account }) : (writes++, response({ data: { id: "987" } }, 201));
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "Once" }, { fetch }), /database interruption/);
  assert.equal(store.actions.get("root")!.status, "sending");
  store.failConfirmed = false;
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "Once" }, { fetch }), /reconciliation/);
  assert.equal(writes, 1);
});
test("known-unsent stale images refresh their copy and media before posting", async () => {
  const store = memoryStore(); const old = message(baseTime); let uploads = 0;
  const action = await store.putAction("root", "x-post", { accountId: account.id, text: old.post, image: old, replyToId: null });
  action.result = { mediaId: "111", mediaReady: true, altSet: true, mediaExpiresAt: baseTime + 86_400_000 };
  const now = baseTime + 61_000, fresh = message(now);
  const fetch: typeof globalThis.fetch = async url => {
    if (String(url).endsWith("/users/me")) return response({ data: account });
    if (String(url).endsWith("/media/upload")) { uploads++; return response({ data: { id: "222", expires_after_secs: 86400 } }); }
    if (String(url).endsWith("/media/metadata")) return response({ data: { id: "222" } });
    return response({ data: { id: "333" } }, 201);
  };
  assert.equal(await deliverPost(store, credentials, account.id, "root", { text: fresh.post, image: fresh }, { fetch, now: () => now }), "333");
  assert.equal(uploads, 1); assert.equal(store.actions.get("root")!.payload.image.generatedAt, fresh.generatedAt);
  assert.equal(store.actions.get("root")!.result.mediaId, "222");
});
test("content expiring during account verification stops immediately before public POST", async () => {
  const store = memoryStore(); const image = message(baseTime); let now = baseTime, reads = 0, posts = 0;
  const fetch: typeof globalThis.fetch = async url => {
    if (String(url).endsWith("/users/me")) { if (++reads === 3) now += 61_000; return response({ data: account }); }
    if (String(url).endsWith("/media/upload")) return response({ data: { id: "222", expires_after_secs: 86400 } });
    if (String(url).endsWith("/media/metadata")) return response({ data: { id: "222" } });
    posts++; return response({ data: { id: "333" } }, 201);
  };
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: image.post, image }, { fetch, now: () => now }), SocialContentExpired);
  assert.equal(posts, 0); assert.equal(store.actions.get("root")!.status, "failed");
});
test("a fresh protocol guard runs after identity lookup and blocks changed state before POST", async () => {
  const store = memoryStore(); const order: string[] = [];
  const fetch: typeof globalThis.fetch = async () => { order.push("account"); return response({ data: account }); };
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "Live now" }, { fetch, beforePost: async () => { order.push("protocol"); throw new Error("sale already sold out"); } }), /sold out/);
  assert.deepEqual(order, ["account", "protocol"]); assert.equal(store.actions.get("root")!.status, "failed");
});
test("confirmed roots are never reposted; remaining links can finish after the opening countdown expires", async () => {
  const store = memoryStore(), image = message(baseTime);
  await store.putAction("event:root", "x-post", { accountId: account.id, text: image.post, image, replyToId: null });
  await store.updateAction("event:root", "confirmed", { postId: "333" });
  let writes = 0, rootGuards = 0;
  const fetch: typeof globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/users/me")) return response({ data: account });
    writes++; assert.equal(JSON.parse(String(init!.body)).reply.in_reply_to_tweet_id, "333"); return response({ data: { id: "444" } }, 201);
  };
  await deliverMessage(store, credentials, account.id, "event", image, { fetch, now: () => baseTime + 3_700_000, beforePost: async () => { rootGuards++; throw new Error("expired"); } });
  assert.equal(writes, 1); assert.equal(rootGuards, 0);
  await deliverMessage(store, credentials, account.id, "event", image, { fetch, now: () => baseTime + 3_700_000 });
  assert.equal(writes, 1);
});
test("rate rejection respects persisted Retry-After before another attempt", async () => {
  const store = memoryStore(); let writes = 0, now = baseTime;
  const fetch: typeof globalThis.fetch = async url => String(url).endsWith("/users/me") ? response({ data: account }) : (writes++, response({}, 429, { "retry-after": "120" }));
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "Rate limited" }, { fetch, now: () => now }), /HTTP 429/);
  now += 30_000;
  await assert.rejects(deliverPost(store, credentials, account.id, "root", { text: "Rate limited" }, { fetch, now: () => now }), MediaPending);
  assert.equal(writes, 1);
});

test("supplemental 403 preserves safe diagnostics and confirmed root, and never blindly retries", async()=>{
  const store=memoryStore(), image=message(baseTime);
  await store.putAction("event:root","x-post",{accountId:account.id,text:image.post,image,replyToId:null});
  await store.updateAction("event:root","confirmed",{postId:"333"});
  let writes=0;
  const fetch:typeof globalThis.fetch=async url=>String(url).endsWith("/users/me")?response({data:account}):(writes++,response({errors:[{code:453,message:"secret material"}],type:"https://api.x.com/2/problems/client-forbidden",detail:"token-secret"},403));
  assert.equal(await deliverMessage(store,credentials,account.id,"event",image,{fetch,supplementalReplies:true}),"333");
  await deliverMessage(store,credentials,account.id,"event",image,{fetch,supplementalReplies:true});
  assert.equal(writes,1);
  const reply=store.actions.get(`event:${image.replyKeys[0]}`)!;
  assert.equal(reply.status,"failed");assert.deepEqual(reply.result.diagnostics,{status:403,codes:[453],problem:"client-forbidden"});
  assert(!JSON.stringify(reply).includes("secret material"));assert(!JSON.stringify(reply).includes("token-secret"));
  await assert.rejects(deliverMessage(store,credentials,account.id,"event",image,{fetch}),/x_retry_after_pending/);
});
