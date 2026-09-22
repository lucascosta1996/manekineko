import assert from "node:assert/strict";
import test from "node:test";
import { collectionSource } from "../lib/collections/source-policy.ts";

test("network-restricted deployments fail without a database instead of returning demo collections", () => {
  for (const chain of ["11155111", "1"]) {
    assert.throws(() => collectionSource({ MANEKINEKO_CHAIN_ID: chain }), /DATABASE_URL is required/);
    assert.throws(() => collectionSource({ MANEKINEKO_CHAIN_ID: chain, DATABASE_URL: "" }), /DATABASE_URL is required/);
  }
});

test("local development requires real database data and never selects the old seed catalog", () => {
  assert.throws(() => collectionSource({}), /DATABASE_URL is required/);
  assert.throws(() => collectionSource({ DATABASE_URL: "" }), /DATABASE_URL is required/);
  const database = "postgresql://fixture.example.com/manekineko";
  assert.equal(collectionSource({ DATABASE_URL: database }), "postgres");
  assert.equal(collectionSource({ MANEKINEKO_CHAIN_ID: "11155111", DATABASE_URL: database }), "postgres");
});

test("a mistyped network cannot re-enable demo fallback even when the database is absent", () => {
  assert.throws(() => collectionSource({ MANEKINEKO_CHAIN_ID: "sepolia" }), /restriction is invalid/);
});
