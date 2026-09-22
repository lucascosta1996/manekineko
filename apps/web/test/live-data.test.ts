import assert from "node:assert/strict";
import test from "node:test";
import { createDataPoller, LIVE_DATA_INTERVAL_MS, LIVE_DATA_MAX_BACKOFF_MS } from "../lib/live-data/poller.ts";
import { mintAvailabilityRevision, collectionResponse, collectionsResponse, historyResponse } from "../lib/live-data/responses.ts";
import type { CollectionPublic } from "../lib/collections/model.ts";

function scheduler() {
  let next = 0;
  const tasks = new Map<number, { callback: () => void; delay: number }>();
  return {
    set(callback: () => void, delay: number) { const key = ++next; tasks.set(key, { callback, delay }); return key; },
    clear(key: unknown) { tasks.delete(key as number); },
    next() { const [key, task] = [...tasks][0] ?? []; assert.ok(task, "Expected a scheduled refresh"); tasks.delete(key); task.callback(); return task.delay; },
    delay() { return [...tasks.values()][0]?.delay; },
    size() { return tasks.size; },
  };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("refreshes external mint data serially and coalesces repeated focus events", async () => {
  const clock = scheduler();
  let resolve!: (value: number) => void;
  let requests = 0;
  const received: number[] = [];
  const poller = createDataPoller({ scheduler: clock, isActive: () => true,
    request: () => { requests += 1; return new Promise<number>((done) => { resolve = done; }); },
    onData: (value) => received.push(value), onError: () => assert.fail("Unexpected error") });
  poller.start();
  assert.equal(clock.next(), LIVE_DATA_INTERVAL_MS);
  poller.refresh(); poller.refresh();
  assert.equal(requests, 1);
  resolve(3); await flush();
  assert.deepEqual(received, [3]);
  assert.equal(clock.next(), 0);
  assert.equal(requests, 2);
  resolve(4); await flush();
  assert.deepEqual(received, [3, 4]);
  assert.equal(clock.delay(), LIVE_DATA_INTERVAL_MS);
  poller.stop();
});

test("hidden/offline pages pause, discard in-flight results, and resume immediately", async () => {
  const clock = scheduler();
  let active = true;
  let resolve!: (value: number) => void;
  let signal!: AbortSignal;
  const received: number[] = [];
  const poller = createDataPoller({ scheduler: clock, isActive: () => active,
    request: (requestSignal) => { signal = requestSignal; return new Promise<number>((done) => { resolve = done; }); },
    onData: (value) => received.push(value), onError: () => assert.fail("Abort is not a data failure") });
  poller.start(); clock.next();
  active = false; poller.pause();
  assert.equal(signal.aborted, true);
  resolve(8); await flush();
  assert.deepEqual(received, []);
  assert.equal(clock.size(), 0);
  poller.refresh(); assert.equal(clock.size(), 0);
  active = true; poller.refresh();
  resolve(9); await flush();
  assert.deepEqual(received, [9]);
  poller.stop();
});

test("unavailable APIs keep the last result, back off to a cap, and recover", async () => {
  const clock = scheduler();
  const received: number[] = [];
  let fail = false;
  let errors = 0;
  const poller = createDataPoller({ scheduler: clock, isActive: () => true,
    request: async () => { if (fail) throw new Error("503"); return 5; },
    onData: (value) => received.push(value), onError: () => { errors += 1; } });
  poller.refresh(); await flush();
  fail = true;
  for (const expected of [30_000, 60_000, 120_000, 120_000, 120_000]) {
    clock.next(); await flush();
    assert.equal(clock.delay(), expected);
    assert.ok(expected <= LIVE_DATA_MAX_BACKOFF_MS);
  }
  assert.deepEqual(received, [5]);
  assert.equal(errors, 5);
  fail = false; clock.next(); await flush();
  assert.deepEqual(received, [5, 5]);
  assert.equal(clock.delay(), LIVE_DATA_INTERVAL_MS);
  poller.stop();
});

test("navigation cleanup cancels the request and ignores its late completion", async () => {
  const clock = scheduler();
  let resolve!: (value: number) => void;
  let signal!: AbortSignal;
  const poller = createDataPoller({ scheduler: clock, isActive: () => true,
    request: (requestSignal) => { signal = requestSignal; return new Promise<number>((done) => { resolve = done; }); },
    onData: () => assert.fail("Unmounted view must not receive data"), onError: () => assert.fail("Unexpected error") });
  poller.refresh(); poller.stop();
  assert.equal(signal.aborted, true);
  resolve(5); await flush();
  assert.equal(clock.size(), 0);
  poller.refresh(); assert.equal(clock.size(), 0);
});

test("mint availability checks track state changes rather than indexer heartbeats", () => {
  const initial = { id: "collection", contractAddress: "0x1", phase: "minting", totalMinted: 2, prizePaid: false, updatedAt: "2026-09-17T00:00:00Z" } as CollectionPublic;
  assert.equal(mintAvailabilityRevision(initial), mintAvailabilityRevision({ ...initial, updatedAt: "2026-09-17T00:00:15Z" }));
  for (const change of [{ totalMinted: 3 }, { phase: "refundable" as const }, { prizePaid: true }]) {
    assert.notEqual(mintAvailabilityRevision(initial), mintAvailabilityRevision({ ...initial, ...change }));
  }
});

test("invalid API responses are rejected instead of clearing good visible data", () => {
  assert.throws(() => collectionsResponse({ error: "Unavailable" }));
  assert.throws(() => collectionsResponse({ collections: [{ totalMinted: -1 }] }));
  assert.throws(() => collectionResponse({ collection: null }));
  assert.throws(() => historyResponse({ collections: [], inProgress: [], stats: {}, source: "postgres", isMock: true }));
  assert.deepEqual(historyResponse({ collections: [], inProgress: [], stats: {}, source: "postgres", isMock: false }).stats, {
    collectionCount: 0, completedCount: 0, refundedCount: 0, totalTicketsMinted: 0, uniqueWinners: 0, currencies: [],
  });
});
