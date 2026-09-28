import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
export function visualEnvironment() {
 const osVersion = process.platform === 'darwin' ? execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim() : process.platform;
 const files = ['/System/Library/Fonts/SFNS.ttf','/System/Library/Fonts/HelveticaNeue.ttc','/System/Library/Fonts/Supplemental/Arial.ttf'];
 const pwRequire=createRequire(require.resolve('playwright'));
 const browsers=JSON.parse(readFileSync(join(dirname(pwRequire.resolve('playwright-core/package.json')),'browsers.json'),'utf8')).browsers.filter(b=>['chromium','firefox','webkit'].includes(b.name)).map(({name,revision,browserVersion})=>({name,revision,browserVersion}));
 return { platform:process.platform,architecture:process.arch,osMajor:osVersion.split('.')[0],osVersion,playwright:require('@playwright/test/package.json').version,browsers,fonts:Object.fromEntries(files.map(file=>[file,process.platform==='darwin'?createHash('sha256').update(readFileSync(file)).digest('hex'):'unavailable'])) };
}
export function assertVisualEnvironment() {
 const expected=JSON.parse(readFileSync(new URL('../../tests/visual/environment.json',import.meta.url),'utf8'));
 const actual=visualEnvironment();
 for(const key of ['platform','architecture','osMajor','playwright','browsers','fonts']) {
  if(JSON.stringify(actual[key])!==JSON.stringify(expected[key])) throw new Error(`Visual baseline environment mismatch: ${key}. Use the documented reference environment or review a new environment baseline; do not relax screenshot thresholds.`);
 }
 return actual;
}

if (process.argv.includes('--assert')) process.stdout.write(JSON.stringify(assertVisualEnvironment()));
