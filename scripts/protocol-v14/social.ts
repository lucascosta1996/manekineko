import { run } from '../protocol-v12/social.ts';
run(14).catch(() => {
  console.error('V14 social operation failed. Check version, deployment pins and the private outbox before retrying.');
  process.exitCode = 1;
});
