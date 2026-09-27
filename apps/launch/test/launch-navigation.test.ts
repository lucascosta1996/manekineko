import assert from "node:assert/strict";
import { test } from "node:test";
import { safeLaunchDestination, launchDestination, launchNetwork, currentLaunchResponse } from "../lib/launch-navigation.ts";

test("login opens dashboard by default and only accepts explicit configuration navigation", () => {
  assert.equal(safeLaunchDestination("/seasons"), "/seasons");
  assert.equal(safeLaunchDestination("/launch"), "/launch");
  assert.equal(safeLaunchDestination("/earnings"), "/earnings");
  for (const value of [undefined, "/", "/automations", "//evil.example", "https://evil.example", "/\\evil.example", "%2f%2fevil.example", ["/launch"], "/api/launch/auth/logout", "/launch?next=https://evil.example"]) {
    assert.equal(safeLaunchDestination(value), "/dashboard");
  }
});


test("network and selected season survive supported deep links and login without admitting arbitrary redirects", () => {
  const id = "79b44791-5787-4a26-90db-86a06a286a3b";
  const href = launchDestination("/seasons", "11155111", id);
  assert.equal(safeLaunchDestination(href), href);
  assert.equal(safeLaunchDestination("/earnings?chainId=11155111"), "/earnings?chainId=11155111");
  for (const input of ["/earnings?chainId=56", "/seasons?chainId=1&chainId=11155111", "/launch?chainId=1&automationId=" + id]) assert.equal(safeLaunchDestination(input), "/dashboard");
  assert.equal(launchNetwork(undefined,"11155111"), "11155111");
});

test("a chain-correct response from an old generation cannot replace the new selection", () => {
  assert.equal(currentLaunchResponse("11155111", "1", 3, 3), false);
  assert.equal(currentLaunchResponse("1", "1", 2, 3), false);
  assert.equal(currentLaunchResponse("1", "1", 3, 3), true);
});

test("dashboard routes preserve network through authentication", () => {
 for (const path of ["/dashboard", "/activity", "/settings"]) {
  assert.equal(safeLaunchDestination(launchDestination(path, "11155111")), `${path}?chainId=11155111`);
 }
});
