import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules','test','tests','artifacts','cache'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}
test('application imports do not depend on operator directories excluded from Vercel', () => {
  const excluded = readFileSync(resolve(root, '.vercelignore'), 'utf8').split('\n').filter(line => /^\/(scripts|docs|database)$/.test(line)).map(line => line.slice(1));
  const paths = [...['web','launch','landing-page','indexer'].flatMap(app => files(resolve(root, 'apps', app))), ...files(resolve(root, 'packages'))];
  const failures = [];
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)) {
      const specifier = match[1]; if (!specifier.startsWith('.')) continue;
      const target = relative(root, resolve(dirname(path), specifier));
      if (excluded.some(prefix => target === prefix || target.startsWith(prefix + '/'))) failures.push(`${relative(root, path)} imports ${specifier}`);
    }
  }
  assert.deepEqual(failures, [], 'Move reusable code into a deployed shared package; keep private operator tools excluded.');
});
