import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, cp, rm } from 'node:fs/promises';
const selected = process.argv.slice(2);
const apps = selected.length ? selected : ['landing','web','launch'];
for (const app of apps) {
  if (!['landing','web','launch'].includes(app)) throw new Error('Unknown fixture app');
  const directory = resolve(`tests/visual/apps/${app}`);
  await rm(`${directory}/public`, { recursive: true, force: true });
  await mkdir(`${directory}/public`, { recursive: true });
  await cp(resolve(`apps/${app === 'landing' ? 'landing-page' : app}/public`), `${directory}/public`, { recursive: true });
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','SYSTEMROOT','CI'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_WEB_URL: 'http://127.0.0.1:4312', NEXT_PUBLIC_LANDING_URL: 'http://127.0.0.1:4311' });
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--require', resolve('scripts/visual/fixed-date.cjs'), resolve('node_modules/next/dist/bin/next'), 'build', directory], { env, stdio: 'inherit' });
    child.on('exit', code => code === 0 ? done() : fail(new Error(`${app} fixture build failed: ${code}`)));
  });
}
