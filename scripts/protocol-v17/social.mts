/** Read-only V17 chain observer. X delivery is independent of all wallet actions. */
import { JsonRpcProvider, type Provider } from 'ethers';
import { pathToFileURL } from 'node:url';
import { observeV17At, assertV17SocialConfig } from '../../packages/protocol/src/social-v17.ts';
import { run, type Config, type Observation } from '../protocol-v12/social.ts';
import { STAGES, TEMPLATE_VERSION } from './social-content.ts';
import { rehearsalProvider } from '../protocol-v14/rehearsal/rpc.mts';
import { XApiError } from '../season-runner/social.ts';

export async function observeV17(config: Config, suppliedProvider?: Provider, observedAt = Date.now()): Promise<Observation[]> {
  assertV17SocialConfig(config);
  const provider = suppliedProvider ?? rehearsalProvider(config.rpcUrl);
  try {
    const block = await provider.getBlock('finalized');
    if (!block?.hash) throw new Error('Fresh finalized chain state unavailable.');
    return await observeV17At(config, provider, { number: block.number, hash: block.hash, timestamp: block.timestamp }, observedAt);
  } finally { if (!suppliedProvider) (provider as JsonRpcProvider).destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadLaunchSocialAccount, fixedLaunchSocialAccountSource } = await import('../protocol-v16/social-account.ts');
  const watch = process.argv[4] === '--watch';
  const resolveAccount = watch ? fixedLaunchSocialAccountSource() : loadLaunchSocialAccount;
  if (watch) process.argv[4] = '--publish';
  try {
    do {
      await run(17, { version: 17, observe: observeV17, templateVersion: TEMPLATE_VERSION, stages: STAGES, resolveAccount });
      if (watch) await new Promise(resolve => setTimeout(resolve, 60_000));
    } while (watch);
  } catch (error) {
    const api = error instanceof XApiError ? error : error instanceof Error && error.cause instanceof XApiError ? error.cause : undefined;
    console.error(JSON.stringify({ status: 'stopped', ...(api ? { httpStatus: api.status, retryAfterSeconds: api.retryAfterSeconds, diagnostics: api.diagnostics } : {}) }));
    console.error('V17 social delivery stopped. Check the private configuration and outbox; reconcile any unresolved delivery before restarting.');
    process.exitCode = 1;
  }
}
