import type { Pool } from 'pg';
import type { Provider } from 'ethers';
import { mergeObservations, prepareDeliveryMedia, deliveryFailureStatus, type Observation } from '../../../packages/contracts/src/social-delivery.ts';
import { STAGES } from '../../../packages/contracts/src/v17-social-content.ts';
import { createXPost, findXPost, verifyXPost, setXMediaAltText, XApiError, type XCredentials } from '../../../packages/contracts/src/x-transport.ts';
import { renderSenderImage } from './social-sender-image.ts';
import { getRuntimeProfile, getRuntimeWorkerProfile } from './season-runtime-store.ts';
import { assertCanonical, observeSender, senderProviders } from './social-sender-chain.ts';
import { claimSender, saveSender, assertSenderLease, finishSender, SenderError, type Sender, type SenderEntry } from './social-sender-store.ts';

export function senderRetry(error: unknown, failures: number): {code:string;seconds:number} {
  const code = error instanceof SenderError ? error.code : error instanceof XApiError ? `x_${error.status ?? 'unavailable'}` : 'sender_unavailable';
  const backoff = Math.min(300,30*2**Math.min(failures,4));
  return {code,seconds:Math.max(backoff,error instanceof XApiError ? error.retryAfterSeconds ?? 0 : 0)};
}
export type CycleDependencies = {
  observe(): Promise<Observation[]>;
  save(): Promise<void>;
  assertCurrent(): Promise<void>;
  prepare(e: SenderEntry): Promise<boolean>;
  publish(e: SenderEntry, guard:()=>Promise<void>): Promise<string>;
  reconcile(e: SenderEntry): Promise<string | undefined>;
  audit(e: SenderEntry, current: Observation[]): Promise<void>;
  now?: ()=>number;
};
/** Storage and transport are injected so crash boundaries can be exercised without public posts. */
export async function deliveryCycle(s: Sender, d: CycleDependencies) {
  const now=d.now ?? Date.now, started=now();
  await d.assertCurrent();
  // A durable intent survives process death and is read back before any new write.
  for (const e of s.entries.filter(e=>e.status==='intent'||e.status==='uncertain')) {
    const id=await d.reconcile(e);
    if (!id) throw new SenderError('delivery_needs_reconciliation');
    e.postId=id;e.status='sent';e.sentAt=now();await d.save();
  }
  const observations=await d.observe();
  for (const e of s.entries.filter(e=>e.status==='sent' && !e.finalized)) await d.audit(e,observations);
  s.entries=mergeObservations(s.entries.filter(e=>e.status!=='pending'||observations.some(o=>o.key===e.key)),observations,STAGES)
    .map(e=>({...e,queuedAt:(e as SenderEntry).queuedAt ?? now()}));
  await d.save();
  let delivered=0;
  for (const e of s.entries.filter(e=>e.status==='pending').slice(0,5)) {
    if (now()-started>45_000) break;
    await d.assertCurrent();
    if (!await d.prepare(e)) break;
    let writeStarted=false;
    try {
      const id=await d.publish(e,async()=>{
        // Check current phase, destination revision and live lease immediately before POST.
        const current=(await d.observe()).find(o=>o.key===e.key);
        if (!current || current.text!==e.text || JSON.stringify(current.image)!==JSON.stringify(e.image)) throw new SenderError('observation_changed');
        e.block=current.block;e.blockHash=current.blockHash;
        await d.assertCurrent();
        e.status='intent';e.intentAt=now();await d.save();
        writeStarted=true;
      });
      e.postId=id;e.status='sent';e.sentAt=now();await d.save();delivered++;
    } catch(error) {
      e.status=deliveryFailureStatus(error,writeStarted);
      await d.save();
      throw error;
    }
  }
  return {observed:true,delivered:delivered>0};
}
async function account(db: Pool, s: Sender) {
  if (!(s.config.version===17 && s.config.chainId===11155111) && !(s.config.version===18 && s.config.chainId===1)) throw new SenderError('unsupported_deployment');
  const saved=await getRuntimeWorkerProfile(db,String(s.config.chainId) as '1'|'11155111');
  const check=async()=>{
    const p=await getRuntimeProfile(db,String(s.config.chainId) as '1'|'11155111');
    if (!p?.enabled || p.revision!==saved.profile.revision || p.expectedAccountId!==s.config.xAccountId || p.publicBaseUrl.replace(/\/$/,'')!==s.config.appUrl.replace(/\/$/,'') || p.chainId!==String(s.config.chainId)) throw new SenderError('profile_changed');
    await assertSenderLease(db,s);
  };
  await check();return {credentials:saved.credentials as XCredentials,check};
}
export async function runSocialSender(db: Pool) {
  const s=await claimSender(db);
  if (!s) return {status:'idle'};
  let providers: [Provider,Provider] | undefined;
  try {
    if(s.config.chainId===1 && process.env.SOCIAL_MAINNET_ENABLED!=='true') throw new SenderError('mainnet_sender_not_enabled');
    const a=await account(db,s), options={expectedAccountId:s.config.xAccountId,timeoutMs:10_000};
    providers=senderProviders(process.env,s.config.chainId);
    const save=()=>saveSender(db,s), observe=()=>observeSender(s.config,providers!);
    const result=await deliveryCycle(s,{
      observe,save,assertCurrent:a.check,
      prepare:async e=>{
        if (!e.image) throw new SenderError('missing_artwork');
        const rendered=await renderSenderImage(e.image);
        if (!await prepareDeliveryMedia(e,rendered,a.credentials,options,save)) return false;
        await setXMediaAltText(a.credentials,e.mediaId!,e.image.alt,options);return true;
      },
      publish:async(e,beforePost)=>(await createXPost(a.credentials,{text:e.text,mediaId:e.mediaId}, {...options,beforePost})).id,
      reconcile:async e=>{
        if (!e.mediaId) return undefined;
        const expected={text:e.text,mediaId:e.mediaId};
        if (e.postId) {await verifyXPost(a.credentials,e.postId,expected,options);return e.postId;}
        return findXPost(a.credentials,expected,options);
      },
      audit:async(e,current)=>{
        try {await assertCanonical(providers!,e);}
        catch(error) {
          if (!(error instanceof SenderError) || error.code!=='chain_reorganized') throw error;
          const replacement=current.find(o=>o.key===e.key && o.text===e.text && JSON.stringify(o.image)===JSON.stringify(e.image));
          if (!replacement) throw new SenderError('reorg_review_required');
          e.block=replacement.block;e.blockHash=replacement.blockHash;
        }
        const finalized=await Promise.all(providers!.map(p=>p.getBlock('finalized')));
        if (finalized.every(b=>b && b.number>=e.block)) e.finalized=true;
      },
    });
    await finishSender(db,s,result);
    return {status:'ok',...result};
  } catch(error) {
    const retry=senderRetry(error,s.failures);
    await finishSender(db,s,{error:retry.code,retrySeconds:retry.seconds,observed:false,delivered:false});
    console.error(JSON.stringify({service:'social-sender',source:s.id,error:retry.code,retrySeconds:retry.seconds}));
    return {status:'retry',error:retry.code,retrySeconds:retry.seconds};
  } finally {
    providers?.forEach(p=>p.destroy());
  }
}
