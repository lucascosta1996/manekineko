import assert from "node:assert/strict";
import test from "node:test";
import type { AutomationPlan } from "../lib/launch-automation.ts";
import type { LaunchConfiguration } from "../lib/launch-config.ts";
import { applyTemplate, cloneStep, cloneAutomationForm, dateInputToUtc, defaultAutomationForm, formFromAutomation, intervalSeconds, payloadFromAutomationForm, resizeSteps, utcToDateInput } from "../components/automations/form-values.ts";
import { defaultLaunchForm, formFromConfiguration, payloadFromForm } from "../components/launch/form-values.ts";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

test("UTC date inputs preserve exact instants across browser timezones and repeated DST hours", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/New_York", "America/Sao_Paulo", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      for (const timestamp of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "2026-03-08T07:30:15Z"]) {
        assert.equal(dateInputToUtc(utcToDateInput(timestamp), "Deadline"), timestamp);
      }
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  assert.equal(dateInputToUtc("", "Start"), null);
  assert.equal(dateInputToUtc("2026-09-13T12:30", "Start"), "2026-09-13T12:30:00Z");
  assert.throws(() => dateInputToUtc("2026-02-30T12:30", "Start"), /not a valid UTC/);
  assert.throws(() => dateInputToUtc("2026-09-13", "Start"), /valid date/);
  assert.throws(() => dateInputToUtc("2026-09-13T24:00", "Start"), /valid UTC/);
});

test("collection growth, duplication and templates copy settings independently", () => {
  const form = defaultAutomationForm(ids.slice(0, 1));
  const original = form.steps[0];
  let idIndex = 0;
  const steps = resizeSteps(form.steps, "3", () => ids[++idIndex]);
  assert.equal(new Set(steps.map((step) => step.id)).size, 3);
  steps[1].form.rates[0] = "5";
  steps[1].form.mintPriceEth = "0.02";
  assert.deepEqual(original.form.rates, []);
  assert.deepEqual(steps[2].form.rates, []);
  assert.equal(original.form.mintPriceEth, "0.01");
  const duplicate = cloneStep(original, ids[2], 4);
  duplicate.form.rates[2] = "9";
  assert.deepEqual(original.form.rates, []);
  const template = { label: "Template", payload: payloadFromForm(defaultLaunchForm()) } as LaunchConfiguration;
  const applied = applyTemplate(original, template);
  applied.form.rates[0] = "15";
  assert.deepEqual(template.payload.contract.affiliateRatesBps, []);
  assert.equal(template.payload.contract.affiliatePoolBps, "2000");
  assert.equal(applied.form.label, original.form.label);
  for (const count of ["0", "11", "101", "1.5", "Infinity", "-1"]) assert.throws(() => resizeSteps(form.steps, count, () => ids[1]), /1 and 10/);
  assert.equal(resizeSteps(steps, "2", () => ids[1]).length, 2);
});

test("each collection keeps independent terms while sharing the first factory authority", () => {
  const form = defaultAutomationForm(ids);
  form.chainId = "11155111";
  form.steps[0].form.factoryMode = "existing";
  form.steps[0].form.factoryAddress = "first-factory";
  form.steps[0].form.deployerAddress = "first-deployer";
  form.steps[0].form.factoryOwnerAddress = "first-owner";
  form.steps[1].form.factoryAddress = "stale-factory";
  form.steps[1].form.duration = "7";
  form.steps[1].form.mintPriceEth = "0.025";
  form.steps[1].form.initialOwner = "second-collection-owner";
  form.steps[1].form.affiliatePoolPercent = "20";
  const payload = payloadFromAutomationForm(form);
  assert.equal(payload.steps[1].payload.contract.mintPriceWei, "25000000000000000");
  assert.equal(payload.steps[1].payload.contract.mintDurationSeconds, "604800");
  assert.equal(payload.steps[0].payload.contract.mintDurationSeconds, "2592000");
  assert.equal(payload.steps[1].payload.contract.affiliatePoolBps, "2000");
  assert.equal(payload.steps[0].payload.contract.affiliatePoolBps, "2000");
  for (const step of payload.steps) {
    assert.equal(step.payload.contract.chainId, "11155111");
    assert.equal(step.payload.operations.factoryAddress, "first-factory");
    assert.equal(step.payload.operations.deployerAddress, "first-deployer");
    assert.equal(step.payload.operations.factoryOwnerAddress, "first-owner");
  }
  assert.equal(payload.steps[1].payload.contract.initialOwner, "second-collection-owner");
  form.steps[2].form.mintPriceEth = "1e3";
  assert.throws(() => payloadFromAutomationForm(form), /Collection 3 \(Collection 03\): Ticket price/);
});

test("saved start, fixed deadlines and non-hour intervals round trip without drift", () => {
  const plan = payloadFromAutomationForm(defaultAutomationForm(ids));
  plan.startAt = "2026-11-01T06:30:00Z";
  plan.intervalSeconds = "90";
  plan.steps[1].deadline = { mode: "fixed", at: "2026-12-01T06:30:45Z" };
  const form = formFromAutomation({ plan } as AutomationPlan);
  assert.deepEqual(payloadFromAutomationForm(form), plan);
  assert.equal(intervalSeconds("2"), "7200");
  assert.equal(intervalSeconds("90", "seconds"), "90");
  assert.throws(() => intervalSeconds("0.5"), /whole number of hours/);
});

test("incomplete API drafts remain editable without crashing or silently becoming zero intervals", () => {
  const plan = payloadFromAutomationForm(defaultAutomationForm(ids));
  for (const interval of ["", "later", "01", "-1", "1.5"]) {
    plan.intervalSeconds = interval;
    const form = formFromAutomation({ plan } as AutomationPlan);
    assert.equal(form.interval, interval);
    assert.equal(form.intervalUnit, "seconds");
    form.interval = "90";
    assert.equal(payloadFromAutomationForm(form).intervalSeconds, "90");
  }
});

test("fixed deadlines keep their exact date when an unfinished hidden duration needs a fallback", () => {
  const form = defaultAutomationForm(ids);
  const step = form.steps[0];
  step.deadlineMode = "fixed";
  step.deadlineInput = "2030-12-01T06:30:45";
  for (const value of ["", "later", "0", "1.5", "366", "100000000000000000000000000000"]) {
    step.form.duration = value;
    step.form.durationUnit = "days";
    const result = payloadFromAutomationForm(form);
    assert.equal(result.steps[0].deadline.at, "2030-12-01T06:30:45Z");
    assert.equal(result.steps[0].payload.contract.mintDurationSeconds, "2592000");
    assert.equal(step.form.duration, value, "Conversion must not mutate the editor state.");
  }
  step.form.duration = "3599";
  step.form.durationUnit = "seconds";
  assert.equal(payloadFromAutomationForm(form).steps[0].payload.contract.mintDurationSeconds, "2592000");
  step.form.duration = "3601";
  assert.equal(payloadFromAutomationForm(form).steps[0].payload.contract.mintDurationSeconds, "3601", "Valid saved durations remain unchanged.");
  step.deadlineMode = "duration";
  step.form.duration = "unfinished";
  assert.throws(() => payloadFromAutomationForm(form), /Sale lifetime must be a whole number/);
});


test("season identity survives edits, templates and reloads while collection colors remain independent", () => {
  const seasonId = `0x${"12".repeat(32)}`;
  const form = defaultAutomationForm(ids, "11155111", seasonId);
  form.name = "Lucky beginnings";
  form.steps[0].form.collectionColor = "#183a2f";
  form.steps[1].form.collectionColor = "#f6f3e9";
  const plan = payloadFromAutomationForm(form);
  assert.equal(plan.seasonId, seasonId);
  for (const step of plan.steps) {
    assert.equal(step.payload.contract.seasonId, seasonId);
    assert.equal(step.payload.contract.seasonName, "Lucky beginnings");
  }
  assert.equal(plan.steps[0].payload.contract.collectionColor, "#183A2F");
  assert.equal(plan.steps[0].payload.contract.textColor, "#FFFFFF");
  assert.equal(plan.steps[1].payload.contract.collectionColor, "#F6F3E9");
  assert.equal(plan.steps[1].payload.contract.textColor, "#000000");
  const restored = formFromAutomation({ plan } as AutomationPlan);
  assert.deepEqual(payloadFromAutomationForm(restored), plan);
  const template = { label: "Other season", payload: payloadFromForm({ ...defaultLaunchForm(), seasonId: `0x${"34".repeat(32)}`, seasonName: "Different", collectionColor: "#102030" }) } as LaunchConfiguration;
  const applied = applyTemplate(restored.steps[0], template);
  assert.equal(applied.form.seasonId, seasonId);
  assert.equal(applied.form.seasonName, "Lucky beginnings");
  assert.equal(applied.form.collectionColor, "#183A2F", "A settings template cannot replace the collection's saved color.");
  assert.equal(applied.form.name, restored.steps[0].form.name);
  assert.equal(template.payload.contract.collectionColor, "#102030");
  form.steps = Array.from({ length: 11 }, (_, index) => ({ ...form.steps[0], id: String(index) }));
  assert.throws(() => payloadFromAutomationForm(form), /1 and 10/);
});

test("historical configurations keep their absent season fields without inventing an identity", () => {
  const payload = payloadFromForm(defaultLaunchForm());
  delete payload.contract.seasonId;
  delete payload.contract.seasonName;
  delete payload.contract.collectionColor;
  delete payload.contract.textColor;
  const record = { label: "Original configuration", payload } as LaunchConfiguration;
  const restored = formFromConfiguration(record);
  assert.equal(restored.seasonId, undefined);
  assert.deepEqual(payloadFromForm(restored), payload);
});


test("copying historical plans preserves V4/V5 fields and allocates fresh season identity only for V6", () => {
  for (const pool of [null, "10"]) {
    const original = defaultAutomationForm(ids);
    delete original.seasonId;
    for (const step of original.steps) {
      delete step.form.algorithmVersion;
      delete step.form.seasonId;
      delete step.form.seasonName;
      delete step.form.collectionColor;
      step.form.affiliatePoolPercent = pool;
      step.form.rates = Array.from({ length: 10 }, () => "1");
    }
    let nextId = 0;
    const copy = cloneAutomationForm(original, () => `copy-${++nextId}`, () => { throw new Error("Legacy copying must not generate a season identity"); });
    assert.equal(copy.seasonId, undefined);
    assert.equal(copy.name, `${original.name} — copy`);
    const payload = payloadFromAutomationForm(copy);
    for (const [index, step] of payload.steps.entries()) {
      assert.equal(step.payload.contract.seasonId, undefined);
      assert.equal(step.payload.contract.seasonName, undefined);
      assert.equal(step.payload.contract.collectionColor, undefined);
      assert.equal(step.payload.contract.algorithmVersion, undefined);
      assert.notEqual(copy.steps[index].id, original.steps[index].id);
    }
    copy.steps[0].form.rates[0] = "7";
    assert.equal(original.steps[0].form.rates[0], "1");
  }
  const original = defaultAutomationForm(ids, "11155111", `0x${"12".repeat(32)}`);
  let generated = 0;
  const copy = cloneAutomationForm(original, () => `copy-${++generated}`, () => `0x${"34".repeat(32)}`);
  assert.equal(copy.seasonId, `0x${"34".repeat(32)}`);
  for (const step of copy.steps) {
    assert.equal(step.form.seasonId, copy.seasonId);
    assert.equal(step.form.seasonName, copy.name);
  }
  assert.equal(original.seasonId, `0x${"12".repeat(32)}`);
});

test("growing a season gives default collection copies distinct public names", () => {
  const original = defaultAutomationForm(ids);
  let nextId = 3;
  const steps = resizeSteps(original.steps, "10", () => `copy-${++nextId}`);
  assert.equal(new Set(steps.map(step => step.form.name)).size, 10);
  assert.equal(steps[9].form.name, "Collection 10");
});


test("duplicate names fit UTF-8 limits and pre-season V6 copies get complete artwork settings", () => {
  for (const name of ["S".repeat(64), "猫".repeat(21)]) {
    const original = defaultAutomationForm(ids);
    original.name = name;
    delete original.seasonId;
    for (const step of original.steps) {
      delete step.form.seasonId;
      delete step.form.seasonName;
      delete step.form.collectionColor;
      step.form.name = "猫".repeat(26);
    }
    const copy = cloneAutomationForm(original, () => crypto.randomUUID(), () => `0x${"56".repeat(32)}`);
    assert.ok(new TextEncoder().encode(copy.name).length <= 64);
    assert.ok(copy.name.endsWith(" — copy"));
    assert.ok(!copy.name.includes("�"));
    const payload = payloadFromAutomationForm(copy);
    for (const step of payload.steps) {
      assert.equal(step.payload.contract.seasonId, copy.seasonId);
      assert.equal(step.payload.contract.seasonName, copy.name);
      assert.equal(step.payload.contract.collectionColor, "#F6F3E9");
      assert.equal(step.payload.contract.textColor, "#000000");
    }
    const collection = cloneStep(original.steps[0], "copy", 4);
    assert.ok(new TextEncoder().encode(collection.form.name).length <= 80);
    assert.ok(collection.form.name.endsWith(" — copy 4"));
    assert.ok(!collection.form.name.includes("�"));
  }
});
