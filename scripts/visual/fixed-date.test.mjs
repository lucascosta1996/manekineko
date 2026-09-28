import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const preload = fileURLToPath(new URL('./fixed-date.cjs', import.meta.url));
// Exercise the actual --require entry point in a child so the test runner's
// clock and built-in Date prototype remain untouched.
function check(source) {
  execFileSync(process.execPath, ['--require', preload, '-e', `const assert = require('node:assert/strict'); ${source}`], { stdio: 'pipe' });
}

test('fixture Date freezes implicit construction and now', () => check(`
  const instant = 1790596800000;
  assert.equal(Date.now(), instant);
  assert.equal(new Date().getTime(), instant);
  assert.equal(new Date().toISOString(), '2026-09-28T12:00:00.000Z');
`));

test('Date remains callable and ignores call arguments', () => check(`
  const expected = new Date('2026-09-28T12:00:00.000Z').toString();
  assert.equal(Date(), expected);
  assert.equal(Date(0), expected);
  assert.equal(Date.call({}, Symbol('ignored')), expected);
  assert.equal(typeof Date(), 'string');
`));

test('explicit construction retains native conversion and invalid-date behavior', () => check(`
  assert.equal(new Date(0).toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(new Date('2024-02-29T06:07:08.009Z').getTime(), 1709186828009);
  assert.equal(new Date(new Date(123)).getTime(), 123);
  assert.equal(new Date(null).getTime(), 0);
  assert.equal(Number.isNaN(new Date(undefined).getTime()), true);
  assert.equal(Number.isNaN(new Date('invalid').getTime()), true);
  const local = new Date(2024, 1, 29, 6, 7, 8, 9);
  assert.deepEqual([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes(), local.getSeconds(), local.getMilliseconds()], [2024, 1, 29, 6, 7, 8, 9]);
`));

test('parse, UTC and now remain own nonenumerable static properties', () => check(`
  for (const name of ['now', 'parse', 'UTC']) {
    const descriptor = Object.getOwnPropertyDescriptor(Date, name);
    assert.equal(typeof descriptor.value, 'function');
    assert.equal(descriptor.enumerable, false);
    assert.equal(descriptor.writable, true);
    assert.equal(descriptor.configurable, true);
  }
  const copied = Object.defineProperties({}, Object.getOwnPropertyDescriptors(Date));
  assert.equal(copied.now(), Date.now());
  assert.equal(copied.parse('2024-02-29T06:07:08.009Z'), 1709186828009);
  assert.equal(copied.UTC(2024, 1, 29, 6, 7, 8, 9), 1709186828009);
  assert.equal(Number.isNaN(copied.parse('invalid')), true);
`));

test('Date prototype, branding and subclass construction remain compatible', () => check(`
  const date = new Date();
  assert.equal(Object.getPrototypeOf(date), Date.prototype);
  assert.equal(Date.prototype.constructor, Date);
  assert.throws(() => Date.prototype.getTime(), TypeError);
  assert.equal(Object.getOwnPropertyDescriptor(Date, 'prototype').writable, false);
  assert.equal(Object.prototype.toString.call(date), '[object Date]');
  assert.equal(Date.name, 'Date');
  assert.equal(Date.length, 7);
  class ObservedDate extends Date { marker() { return 'observed'; } }
  const implicit = new ObservedDate();
  const explicit = new ObservedDate(0);
  assert.equal(implicit instanceof ObservedDate, true);
  assert.equal(implicit instanceof Date, true);
  assert.equal(Object.getPrototypeOf(implicit), ObservedDate.prototype);
  assert.equal(implicit.getTime(), Date.now());
  assert.equal(implicit.marker(), 'observed');
  assert.equal(explicit.toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(ObservedDate.now(), Date.now());
  assert.equal(ObservedDate.parse('1970-01-01T00:00:00.000Z'), 0);
`));
