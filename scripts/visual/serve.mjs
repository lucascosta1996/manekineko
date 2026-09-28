import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const app = process.argv[2];
if (!['landing', 'web', 'launch'].includes(app)) throw new Error('Expected visual fixture app');
const port = { landing: 4311, web: 4312, launch: 4313 }[app];
// Intentionally allowlist the process environment. No app .env files, database
// credentials, signing keys, hosted auth or private network URLs enter fixtures.
const env = Object.fromEntries(['PATH','HOME','TMPDIR','SYSTEMROOT','CI'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_WEB_URL: 'http://127.0.0.1:4312', NEXT_PUBLIC_LANDING_URL: 'http://127.0.0.1:4311' });
const child = spawn(process.execPath, ['--require', resolve('scripts/visual/fixed-date.cjs'), resolve('node_modules/next/dist/bin/next'), 'start', resolve(`tests/visual/apps/${app}`), '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: 'inherit' });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
