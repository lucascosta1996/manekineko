import assert from "node:assert/strict";
import test from "node:test";
import { collectionEconomics, defaultLaunchForm, formFromConfiguration, fromScaled, payloadFromForm, toScaled } from "../components/launch/form-values.ts";
import type { LaunchConfiguration } from "../lib/launch-config.ts";

test("ETH and percentage form values retain exact integer precision", () => {
  assert.equal(toScaled("123456.123456789012345678", 18, "ETH"), "123456123456789012345678");
  assert.equal(fromScaled("123456123456789012345678", 18), "123456.123456789012345678");
  assert.equal(toScaled("99.99", 2, "Rate"), "9999");
  assert.equal(toScaled("0.01", 2, "Rate"), "1");
  assert.equal(toScaled("", 18, "ETH"), "");
  assert.throws(() => toScaled("0.0000000000000000001", 18, "ETH"), /18 decimal places/);
  assert.throws(() => toScaled("1e18", 18, "ETH"));
  assert.throws(() => toScaled("-1", 2, "Rate"));
});

test("sellout estimate uses only the highest own-referral rate, not the sum of position rates", () => {
  const form = { ...defaultLaunchForm(), prizePercent: "50", affiliatePoolPercent: null };
  assert.deepEqual(collectionEconomics(form), { sales: "10", prize: "5", maxCommission: "0.1", operatorMinimum: "4.9" });
  form.rates[9] = "2";
  assert.deepEqual(collectionEconomics(form), { sales: "10", prize: "5", maxCommission: "0.2", operatorMinimum: "4.8" });
  form.rates[9] = "50.01";
  assert.equal(collectionEconomics(form), null);
});

test("saved durations round trip exactly even when they are not a whole day or hour", () => {
  const payload = payloadFromForm(defaultLaunchForm());
  payload.contract.mintDurationSeconds = "86401";
  payload.operations.enrollmentWindowSeconds = "3601";
  const record: LaunchConfiguration = { id: "example", label: "Configuration", payload, revision: 1, status: "draft", contentHash: null, createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z", finalizedAt: null, createdBy: "operator", updatedBy: "operator", finalizedBy: null };
  const form = formFromConfiguration(record);
  assert.equal(form.durationUnit, "seconds");
  assert.equal(form.enrollmentDurationUnit, "seconds");
  assert.deepEqual(payloadFromForm(form), payload);
});

test("slot growth copies the last configured rate and cannot allocate an unbounded list", () => {
  const form = { ...defaultLaunchForm(), prizePercent: "50", affiliatePoolPercent: null };
  form.slots = "11";
  form.rates[9] = "2.25";
  assert.equal(payloadFromForm(form).contract.affiliateRatesBps.at(-1), "225");
  form.slots = "100000000000000000000";
  assert.throws(() => payloadFromForm(form), /1 and 100/);
  form.slots = "1.5";
  assert.throws(() => payloadFromForm(form), /1 and 100/);
});
