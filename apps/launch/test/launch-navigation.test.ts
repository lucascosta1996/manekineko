import assert from "node:assert/strict";
import { test } from "node:test";
import { safeLaunchDestination } from "../lib/launch-navigation.ts";

test("login opens seasons by default and only accepts explicit configuration navigation", () => {
  assert.equal(safeLaunchDestination("/seasons"), "/seasons");
  assert.equal(safeLaunchDestination("/launch"), "/launch");
  for (const value of [undefined, "/", "/automations", "//evil.example", "https://evil.example", "/\\evil.example", "%2f%2fevil.example", ["/launch"], "/api/launch/auth/logout", "/launch?next=https://evil.example"]) {
    assert.equal(safeLaunchDestination(value), "/seasons");
  }
});
