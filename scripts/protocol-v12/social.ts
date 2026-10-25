/** One-way projection: no signer, database authority or protocol writes. */
import { Contract, JsonRpcProvider, getAddress, type Provider } from 'ethers';
import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import votingAbi from '../../packages/contracts/src/ManekinekoVotingV12.json' with { type: 'json' };
import { createXPost, verifyXPost, uploadXMedia, getXMediaStatus, setXMediaAltText, XApiError, AmbiguousDelivery, type XCredentials } from '../season-runner/social.ts';
import { renderSeasonSocialImage } from '../season-runner/social-image.ts';
import { lifecycleMessages, socialImage, STAGES, SOCIAL_TEMPLATE_VERSION } from './social-content.ts';
import type { SeasonSocialMessage } from '../../packages/contracts/src/season-social.ts';
import { runtimeVersion, workerRuntime, verifyWorkerRound } from './runtime.ts';
export { lifecycleMessages } from './social-content.ts';
export type Observation = { key: string; text: string; block: number; blockHash: string; image?: SeasonSocialMessage };
export type Delivery = Observation & { status: 'pending' | 'intent' | 'sent' | 'uncertain'; postId?: string; mediaId?: string; mediaExpiresAt?: number; imageHash?: string };
export type Config = {
  version?: 12 | 13 | 14;
  holderRewardsCodeHash?: string;
  genesisCodeHash?: string;
  chainId: number;
  controller: string;
  controllerCodeHash: string;
  rpcUrl: string;
  appUrl: string;
  xAccountId: string;
};
export function mergeObservations(existing: Delivery[], observations: Observation[]): Delivery[] {
  const map = new Map(existing.map((e) => [e.key, e]));
  for (const e of observations) {
    const previous = map.get(e.key);
    // Only unsent work can adopt new branding/copy. Never mutate a delivery that may exist on X.
    if (!previous || previous.status === 'pending') {
      const same = previous?.text === e.text && JSON.stringify(previous?.image) === JSON.stringify(e.image);
      map.set(e.key, same ? { ...previous!, ...e } : { ...e, status: 'pending' });
    }
  }
  return [...map.values()].sort((a, b) => {
    const left = a.key.split(':'), right = b.key.split(':');
    return Number(left.at(-2)) - Number(right.at(-2)) || STAGES.indexOf(left.at(-1) as typeof STAGES[number]) - STAGES.indexOf(right.at(-1) as typeof STAGES[number]);
  });
}
export async function observe(config: Config, suppliedProvider?: Provider): Promise<Observation[]> {
  if (![1, 11155111].includes(config.chainId) && !(suppliedProvider && config.chainId === 31337)) throw new Error('Unsupported social network.');
  const app = new URL(config.appUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash)
    throw new Error('Invalid public app URL.');
  const provider = suppliedProvider ?? new JsonRpcProvider(config.rpcUrl);
  try {
    if (Number((await provider.getNetwork()).chainId) !== config.chainId)
      throw new Error('Social network mismatch.');
    const block = await provider.getBlock('finalized');
    if (!block?.hash || Date.now() / 1000 - block.timestamp > 3600) throw new Error('Fresh finalized chain state unavailable.');
    const runtime = await workerRuntime(provider, { ...config, codeHash: config.controllerCodeHash }, block.number);
    const c = runtime.controller,
      at = { blockTag: block.number };
    if (!(await c.catalogSealed(at))) return [];
    const count = Number(await c.roundCount(at));
    if (count > 256) throw new Error('Invalid catalog.');
    const catalogCount = Number(await c.catalogCount(at));
    if (catalogCount < count || catalogCount > 256) throw new Error('Invalid catalog.');
    const plans = await Promise.all(Array.from({ length: catalogCount }, (_, i) => c.collectionPlan(i, at)));
    const seasonIds = [...new Set(plans.map(p => String(p.seasonId)))];
    const v = new Contract(await c.voting(at), votingAbi, provider),
      observations: Observation[] = [];
    for (let id = 1; id <= count; id++) {
      const address = await c.rounds(id, at),
        r = new Contract(address, runtime.roundAbi, provider);
      await verifyWorkerRound(r, runtime, block.number);
      const [name, saleStart, deadline, sold, revealed, paid, ballot, randomnessDeadline, randomnessReceived] = await Promise.all([
        r.name(at),
        r.saleStartAt(at),
        r.mintDeadline(at),
        r.soldOut(at),
        r.revealed(at),
        r.prizePaid(at),
        v.ballots(address, at),
        r.randomnessDeadline(at),
        r.randomnessReceived(at),
      ]);
      const plan = plans[id - 1], seasonPlans = plans.filter(p => p.seasonId === plan.seasonId);
      const season = { id: plan.seasonId, number: seasonIds.indexOf(plan.seasonId) + 1, name: plan.seasonName, colors: seasonPlans.map(p => p.color) };
      // The image only uses immutable identity. Mutable ballot economics are not advertised as final.
      const collection = { id: address, number: seasonPlans.indexOf(plan) + 1, name, color: plan.color, supply: 0, mintPriceEth: '0', winnerCount: 0, prizePerWinnerEth: '0' };
      const messages = lifecycleMessages({
        version: runtime.version,
        prefix: config.chainId === 11155111 ? '[Sepolia testnet] ' : '',
        name,
        id,
        link: `${app.origin}/`,
        now: BigInt(block.timestamp),
        voteStart: ballot.startsAt,
        saleStart,
        deadline,
        sold,
        revealed,
        paid,
        randomnessDeadline,
        randomnessReceived,
      });
      observations.push(
        ...messages.map((e) => ({
          ...e,
          key: `${config.chainId}:${config.controller.toLowerCase()}:${e.key}`,
          block: block.number,
          blockHash: block.hash!,
          image: socialImage({ version: runtime.version, chainId: config.chainId === 1 ? 1 : 11155111, stage: e.stage, season, collection, timestamp: Number(ballot.startsAt), text: e.text }),
        }))
      );
    }
    return observations;
  } finally {
    if (!suppliedProvider) (provider as JsonRpcProvider).destroy();
  }
}
export function assertPublishable(entries: Delivery[]) {
  if (entries.some(e => e.status === 'intent' || e.status === 'uncertain'))
    throw new Error('Reconcile unresolved delivery before publishing any later event.');
}
export function deliveryFailureStatus(error: unknown, writeStarted: boolean): 'pending' | 'uncertain' {
  // Explicit API rejection or a failed preflight proves no public post was accepted.
  // Network/5xx/malformed-success ambiguity and persistence failure after a send require reconciliation.
  return !writeStarted || (error instanceof XApiError && !(error instanceof AmbiguousDelivery)) ? 'pending' : 'uncertain';
}
export async function run(requiredVersion?: 12 | 13 | 14) {
  const [configFile, stateFile, mode = '--observe', eventKey, postId] = process.argv.slice(2);
  if (!configFile || !stateFile || !['--observe', '--publish', '--reconcile'].includes(mode))
    throw new Error(
      'Usage: social.ts config.json state.json [--observe|--publish|--reconcile eventKey postId]'
    );
  const config: Config = JSON.parse(await readFile(configFile, 'utf8'));
  const version = runtimeVersion(config);
  if (requiredVersion && version !== requiredVersion) throw new Error('Explicit worker version required.');
  const binding = `${config.chainId}:${getAddress(
    config.controller
  )}:${config.controllerCodeHash.toLowerCase()}:${config.xAccountId}`;
  // Exclusive durable lock. A crash leaves the lock for explicit review, never automatic duplicate delivery.
  const lock = await open(`${stateFile}.lock`, 'wx', 0o600);
  let state: { binding: string; templateVersion?: string; entries: Delivery[] };
  const save = async () => {
    await writeFile(`${stateFile}.tmp`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flush: true });
    await rename(`${stateFile}.tmp`, stateFile);
    const directory = await open(dirname(stateFile), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  };
  try {
    try {
      state = JSON.parse(await readFile(stateFile, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      state = { binding, entries: [] };
    }
    if (state.binding !== binding) throw new Error('Outbox network/controller/account binding mismatch.');
    state.templateVersion = SOCIAL_TEMPLATE_VERSION;
    if (mode === '--observe') {
      state.entries = mergeObservations(state.entries, await observe(config));
      await save();
      console.log(
        JSON.stringify({
          observed: state.entries.length,
          pending: state.entries.filter((e) => e.status === 'pending').length,
        })
      );
      return;
    }
    const prefix =
      config.chainId === 1 ? `V${version}_MAINNET_X_` : config.chainId === 11155111 ? `V${version}_SEPOLIA_X_` : '';
    if (!prefix) throw new Error('Unsupported network.');
    const credentials: XCredentials = {
      apiKey: process.env[prefix + 'API_KEY'] ?? '',
      apiKeySecret: process.env[prefix + 'API_KEY_SECRET'] ?? '',
      accessToken: process.env[prefix + 'ACCESS_TOKEN'] ?? '',
      accessTokenSecret: process.env[prefix + 'ACCESS_TOKEN_SECRET'] ?? '',
    };
    const options = { expectedAccountId: config.xAccountId };
    if (mode === '--reconcile') {
      const e = state.entries.find((e) => e.key === eventKey);
      if (!e || !['intent', 'uncertain'].includes(e.status) || !postId)
        throw new Error('Choose an unresolved delivery and its candidate post.');
      await verifyXPost(credentials, postId, { text: e.text, mediaId: e.mediaId }, options);
      e.postId = postId;
      e.status = 'sent';
      await save();
      return;
    }
    assertPublishable(state.entries);
    // Refresh pending work only; previously sent/uncertain content remains exact reconciliation evidence.
    state.entries = mergeObservations(state.entries, await observe(config));
    await save();
    for (const e of state.entries.filter((e) => e.status === 'pending').slice(0, 5)) {
      if (!e.image) throw new Error('Branded image observation unavailable.');
      const rendered = await renderSeasonSocialImage(e.image);
      if (!e.mediaId || !e.mediaExpiresAt || e.mediaExpiresAt <= Date.now() + 60_000 || e.imageHash !== rendered.sha256) {
        const media = await uploadXMedia(credentials, rendered.png, options);
        e.mediaId = media.id;
        e.mediaExpiresAt = Date.now() + media.expiresAfterSecs * 1000;
        e.imageHash = rendered.sha256;
        await save();
      }
      const media = await getXMediaStatus(credentials, e.mediaId, options);
      if (media.processingState !== 'succeeded') return; // Resume later without a public-post intent.
      await setXMediaAltText(credentials, e.mediaId, e.image.alt, options);
      let writeStarted = false;
      const beforePost = async () => {
        const current = (await observe(config)).find(o => o.key === e.key);
        if (!current || current.text !== e.text || JSON.stringify(current.image) !== JSON.stringify(e.image))
          throw new Error('Outbox no longer matches canonical chain state.');
        writeStarted = true;
      };
      // Durable intent precedes the only public write. Uncertain results stop the whole queue.
      e.status = 'intent';
      await save();
      try {
        const result = await createXPost(credentials, { text: e.text, mediaId: e.mediaId }, { ...options, beforePost });
        e.postId = result.id;
        e.status = 'sent';
        await save();
      } catch (error) {
        e.status = deliveryFailureStatus(error, writeStarted);
        await save();
        throw new Error(e.status === 'uncertain'
          ? 'X delivery stopped. Reconcile this entry before retrying. Protocol execution is unaffected.'
          : 'X rejected this attempt before accepting a post. Resolve the failure before publishing again. Protocol execution is unaffected.');
      }
    }
  } finally {
    await lock.close();
    await unlink(`${stateFile}.lock`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run().catch(() => {
    console.error(
      'Social operation failed. Inspect the local outbox; do not retry an unresolved delivery.'
    );
    process.exitCode = 1;
  });
