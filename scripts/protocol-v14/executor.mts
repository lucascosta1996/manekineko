import { main } from '../protocol-v12/executor.mts';
main(14).catch(() => {
  console.error('V14 executor stopped. Check deployment pins, gas funding and the private journal before restarting. No replacement transaction was created.');
  process.exitCode = 1;
});
