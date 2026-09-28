import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectSource } from './source-policy.mjs';

const jsx = text => inspectSource('apps/web/components/policy-fixture.tsx', text);
const css = text => inspectSource('apps/web/app/policy-fixture.css', text);

test('raw fields and disclosures must use their actual shared contracts', () => {
  for (const source of ['<input />', '<textarea />', '<Field label="Email"><input /></Field>', '<details><summary className="ui-disclosure">Details</summary></details>', '<input className="ui-input" type="checkbox" />', '<input className="ui-checkbox" type="checkbox" />']) assert.notEqual(jsx(source).length, 0, source);
  for (const source of ['<input className="ui-input" />', '<textarea className="ui-textarea" />', '<Field label="Email"><input className="ui-input" /></Field>', '<details className="ui-disclosure"><summary>Details</summary></details>', '<label className="ui-check-field"><input className="ui-checkbox" type="checkbox" /></label>', '<label className="ui-check-field"><input className="ui-radio" type="radio" /></label>', '<label className="ui-check-field"><input className="ui-switch" type="checkbox" /></label>']) assert.deepEqual(jsx(source), [], source);
});
test('hidden transport and inert honeypot fields are precise semantic exemptions', () => {
  assert.deepEqual(jsx('<input type="hidden" />'), []);
  assert.deepEqual(jsx('<div inert aria-hidden="true"><input tabIndex={-1} /></div>'), []);
  for (const source of ['<div aria-hidden="true"><input tabIndex={-1} /></div>', '<div inert aria-hidden="true"><input /></div>', '<div inert={false} aria-hidden="true"><input tabIndex={-1} /></div>', '<div inert={hidden} aria-hidden="true"><input tabIndex={-1} /></div>']) assert.notEqual(jsx(source).length, 0, source);
});
test('conditional classes must guarantee the shared contract', () => {
  assert.deepEqual(jsx('<input className={valid ? "ui-input valid" : "ui-input invalid"} />'), []);
  assert.notEqual(jsx('<input className={valid ? "ui-input" : "unstyled"} />').length, 0);
  assert.deepEqual(jsx('<input className={`ui-input ${extra}`} />'), []);
  assert.deepEqual(jsx('<input className={"ui-input " + extra} />'), []);
  assert.notEqual(jsx('<input className={`ui-input${suffix}`} />').length, 0);
  assert.notEqual(jsx('<input className={"ui-input" + suffix} />').length, 0);
});
test('actual control families retain shared metric and state ownership', () => {
  for (const selector of ['.ui-button', '.ui-icon-button', '.ui-text-action', '.ui-text-action-inline', '.ui-select', '.ui-select-content', '.ui-select-item', '.ui-input', '.ui-input::file-selector-button', '.ui-textarea', '.ui-checkbox', '.ui-radio', '.ui-switch', '.ui-check-field', '.ui-field-label', '.ui-disclosure > summary', '.ui-tab', '.ui-segment', '.ui-card-action', ':is(.ui-input, .ui-textarea)']) {
    for (const declaration of ['font-size:12px', 'padding:4px', 'background:red', 'border-radius:8px', 'min-height:24px', 'min-width:24px', 'min-inline-size:24px']) assert.notEqual(css(`${selector} { ${declaration} }`).length, 0, `${selector} ${declaration}`);
  }
});
test('consumer layout and unrelated siblings remain app-owned', () => {
  for (const source of ['.dashboard .ui-select { width: 180px; flex: none; }', '.ui-input { width: 100%; flex: 1; }', '.ui-button + p { font-size: 15px; }', '.ui-disclosure summary > span { font-size: 12px; }']) assert.deepEqual(css(source), [], source);
  assert.notEqual(css(':root { --ui-control-height:24px }').length, 0);
});
