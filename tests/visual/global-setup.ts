import { mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const requirePackage = createRequire(`${process.cwd()}/package.json`);
export default async function globalSetup() {
 const environment = JSON.parse(execFileSync(process.execPath, ['scripts/visual/environment.mjs', '--assert'], { encoding: 'utf8' }));
 await mkdir('test-results', { recursive: true });
 await writeFile('test-results/visual-environment.json', JSON.stringify({
  ...environment, node: process.version, playwright: requirePackage('@playwright/test/package.json').version,
  axe: JSON.parse(await readFile('node_modules/@axe-core/playwright/package.json', 'utf8')).version, platform: process.platform,
  architecture: process.arch, osRelease: os.release(),
  osVersion: process.platform === 'darwin' ? execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim() : os.version(),
  locale:'en-US', timezone:'UTC', deviceScaleFactor:1,
  fontStack:'-apple-system, BlinkMacSystemFont, Helvetica Neue, Arial, sans-serif',
  fixtureTime:'2026-09-28T12:00:00.000Z',
  isolation:'No inherited application environment, no database/auth imports, external requests blocked, API writes intercepted.'
 },null,2)+'\n');
}
