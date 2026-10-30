'use client';
import mainnetCatalog from '../../catalog/mainnet.json';
import { ProtocolExperience } from '@manekineko/protocol/experience';
import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'ethers';
import { Button, LinkButton } from '@manekineko/ui/button';
import { ConfirmProvider, useConfirm } from '@manekineko/ui/confirm';
import { Field, Input } from '@manekineko/ui/forms';
import { FloatingNotice } from '@manekineko/ui/floating-notice';
import { WalletAccountPicker } from '@manekineko/protocol/wallet-account-picker';
import { useWalletSession } from '@manekineko/protocol/use-wallet-session';
import { assertWallet, walletError } from '@manekineko/protocol/wallet';
import { TINCTA_OPTIONS } from '@manekineko/protocol/tincta';
import { DEPLOYMENT_JOURNAL, DEPLOYMENT_LOCK, assertFreshReview, mainnetReaders, parseDeploymentIntent, recoverDeployment, reviewDeployment, walletCreationRequest, type DeploymentIntent, type DeploymentReview } from '@manekineko/protocol/tincta-deployment';

type Result = NonNullable<Awaited<ReturnType<typeof recoverDeployment>>>;
export function MainnetDeployment({ configuredAddress }: { configuredAddress?: string }) {
  return <ConfirmProvider><Deployment configuredAddress={configuredAddress} /></ConfirmProvider>;
}
function Deployment({ configuredAddress }: { configuredAddress?: string }) {
  const wallet = useWalletSession(), requestConfirmation = useConfirm();
  const [review, setReview] = useState<DeploymentReview | null>(null);
  const [intent, setIntent] = useState<DeploymentIntent | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const running = useRef(false);
  const session = wallet.session;
  useEffect(() => { let active = true;
    void (async () => { try {
      const saved = localStorage.getItem(DEPLOYMENT_JOURNAL);
      if (saved) { const pending = await parseDeploymentIntent(saved); if (active) { setIntent(pending); setHash(pending.hash ?? ''); } }
      if (active) setBlocked(false);
    } catch (e) { if (active) setNotice(e instanceof Error ? e.message : 'The saved deployment request could not be read.'); }
    finally { if (active) setLoaded(true); } })();
    return () => { active = false; };
  }, []);
  useEffect(() => { setReview(null); }, [session]);
  useEffect(() => { if (wallet.notice) setNotice(wallet.notice); }, [wallet.notice]);
  // An interrupted or broadcast request remains a durable blocker in every tab.
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === DEPLOYMENT_JOURNAL) { setReview(null); setBlocked(true); setNotice('The deployment record changed in another tab. Reload this page to recover its status.'); } };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, []);
  async function run(label: string, task: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(label); setNotice(label);
    try { await task(); } catch (e) { setNotice(walletError(e)); }
    finally { running.current = false; setBusy(''); }
  }
  async function prepare() {
    if (!session || intent || configuredAddress || blocked) return;
    await run('Checking deployment and network fees…', async () => {
      const readers = mainnetReaders();
      try { await assertWallet(session); const next = await reviewDeployment(session.address, readers); await assertWallet(session); setReview(next); setNotice('Deployment checked. Review the wallet, fixed rules and network fee before approving.'); }
      finally { readers.forEach(p => p.destroy()); }
    });
  }
  async function deploy() {
    if (!session || !review || intent || configuredAddress || blocked) return;
    const reviewed = review, selected = session;
    await run('Preparing deployment approval…', async () => {
      const accepted = await requestConfirmation({ title: 'Deploy Tincta Rewards on Ethereum?', description: <>
        <span>Wallet: {reviewed.from}</span><br /><span>Creates the NFT contract and its immutable artwork and calculation helper. Sends 0 ETH; network fees apply. Maximum reviewed network fee: {formatEther(BigInt(reviewed.gas) * BigInt(reviewed.maxFeePerGas))} ETH.</span><br /><span>Genesis stays closed until you upload the catalog, fund operations and separately approve opening it. Contract rules cannot be edited after deployment.</span>
      </>, confirmLabel: 'Continue to wallet' });
      if (!accepted) { setNotice('Deployment approval cancelled.'); return; }
      if (!navigator.locks) throw Error('This browser cannot safely lock deployment across tabs. Use a current wallet browser.');
      await navigator.locks.request(DEPLOYMENT_LOCK, { ifAvailable: true }, async lock => {
        if (!lock) throw Error('Another tab is handling deployment. Complete or cancel its wallet request first.');
        if (localStorage.getItem(DEPLOYMENT_JOURNAL)) throw Error('A deployment request is already saved. Reload this page and recover it before continuing.');
        const readers = mainnetReaders();
        try {
          await assertWallet(selected); await assertFreshReview(reviewed, selected.address, readers); await assertWallet(selected);
          const pending: DeploymentIntent = { schema: 1, chainId: 1, from: reviewed.from, nonce: reviewed.nonce, data: reviewed.data, createdAt: Date.now() };
          localStorage.setItem(DEPLOYMENT_JOURNAL, JSON.stringify(pending));
          // Storage must succeed before opening the wallet. Never auto-resubmit an uncertain request.
          setIntent(pending); setReview(null); setBusy('Confirm deployment in your wallet…'); setNotice('Review the contract creation in your wallet. This is the only step that submits deployment.');
          try {
            const txHash = await selected.injected.request({ method: 'eth_sendTransaction', params: [walletCreationRequest(reviewed)] });
            if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(txHash)) throw Error('The wallet did not return a transaction hash. Check its activity before continuing.');
            const sent = { ...pending, hash: txHash };
            localStorage.setItem(DEPLOYMENT_JOURNAL, JSON.stringify(sent)); setIntent(sent); setHash(txHash);
            setNotice('Deployment submitted. Waiting for confirmations and independent contract verification.');
          } catch (e) {
            if (Number((e as { code?: unknown })?.code) === 4001) { localStorage.removeItem(DEPLOYMENT_JOURNAL); setIntent(null); setNotice('Deployment rejected in your wallet. No new request will be submitted automatically.'); }
            else throw Error('The wallet response is uncertain. Check wallet activity and recover using its transaction hash. Do not submit deployment again.', { cause: e });
          }
        } finally { readers.forEach(p => p.destroy()); }
      });
    });
  }
  async function recover() {
    if (!intent || !hash) return;
    await run('Verifying the deployment receipt…', async () => {
      const readers = mainnetReaders();
      try {
        const verified = await recoverDeployment(intent, hash, readers);
        if (!verified) { setNotice('Waiting for the deployment and two further blocks. You can safely return to this page later.'); return; }
        setResult(verified);
        if (verified.status === 'reverted') setNotice('Deployment reverted. Network fees may have been spent. Keep this receipt for review before retrying.');
        else { const saved = { ...intent, hash }; localStorage.setItem(DEPLOYMENT_JOURNAL, JSON.stringify(saved)); setIntent(saved); setNotice('Deployment confirmed. Both independent connections verified the contract, helper and fixed production rules. Genesis remains closed.'); }
      } finally { readers.forEach(p => p.destroy()); }
    });
  }
  useEffect(() => {
    if (!intent?.hash || result || blocked) return;
    const timer = setInterval(() => { if (!running.current) void recover(); }, 12000);
    return () => clearInterval(timer);
  });
  function downloadRecord() {
    if (result?.status !== 'deployed' || !intent) return;
    const body = JSON.stringify({ name: 'Tincta Rewards', contractVersion: 'tincta-rewards-1', chainId: 1, operator: intent.from, transactionHash: hash, ...result, source: '/api/deployment/source', publicActivation: 'pending' }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'tincta-rewards-mainnet-deployment.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="protocol-page mainnet-deployment">
    <section className="protocol-heading"><p className="protocol-eyebrow">Tincta Rewards · Ethereum Mainnet</p><h1>Review. Connect. Deploy.</h1><p>Choose the wallet that will launch Tincta. Deployment requires your approval in that wallet.</p></section>
    <section className="deployment-summary" aria-labelledby="rules-heading"><h2 id="rules-heading">The production rules</h2><p>Genesis has 1,000 free NFTs, two lifetime mints per wallet and no deadline. Its final mint opens the first 24-hour ballot. Every paid ballot and mint window lasts 24 hours. Randomness has 72 hours to arrive after sellout.</p>
      <div className="deployment-table-wrap"><table><caption>Immutable voting packages</caption><thead><tr><th scope="col">Package</th><th scope="col">NFTs</th><th scope="col">Mint price</th><th scope="col">Equal prizes</th></tr></thead><tbody>{TINCTA_OPTIONS.map((o, i) => <tr key={i}><th scope="row">Option {i + 1}</th><td>{o.supply.toLocaleString('en-US')}</td><td>{formatEther(o.price)} ETH</td><td>{String(o.winners)}</td></tr>)}</tbody></table></div>
      <p className="protocol-note">60% prizes · 20% qualified affiliates · 10% season holders · 10% treasury. No qualified affiliates sends their pool to treasury. Refunds return the full mint price when the collection is unsold or randomness misses its deadline. Claims do not expire.</p>
      <a href="/api/deployment/source">Download the reviewed contract source</a>
    </section>
    <section className="deployment-summary" aria-labelledby="deployment-heading"><h2 id="deployment-heading">Your deployment</h2>
      {configuredAddress ? <p>A production contract is already configured: <a href={`https://etherscan.io/address/${configuredAddress}`}>{configuredAddress}</a>. New deployment is disabled.</p> : !loaded ? <p role="status">Checking for an existing deployment request…</p> : <>
        {intent ? <><p>A deployment request is saved for <span className="deployment-address">{intent.from}</span>. Recover this request before taking another action.</p>
          <Field label="Deployment transaction hash" hint="Copy it from your wallet’s activity if the browser lost its connection.">{props => <Input {...props} value={hash} onChange={e => setHash(e.target.value)} autoComplete="off" spellCheck={false} />}</Field>
          <Button variant="secondary" busy={!!busy} disabled={!!busy || !hash || blocked} onClick={() => void recover()}>Verify deployment</Button>
          {hash && /^0x[0-9a-f]{64}$/i.test(hash) && <p><a href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a></p>}
          {result?.status === 'deployed' && <><p>Verified contract: <a className="deployment-address" href={`https://etherscan.io/address/${result.address}`}>{result.address}</a></p><Button variant="secondary" onClick={downloadRecord}>Download deployment record</Button><p>Next: verify the published source, upload the 216-collection catalog, fund operations and approve opening Genesis. Public apps and X delivery are activated separately after those checks.</p></>}
        </> : <>
          <p>The chosen account becomes the operating recipient. It does not gain power to change frozen rules or take reserved prizes, holder rewards or refunds.</p>
          <p className="deployment-address">{session ? `Selected wallet: ${session.address}` : 'No wallet connected.'}</p>
          <Button variant="secondary" disabled={!!busy || blocked} onClick={() => wallet.openPicker(1)}>{session ? 'Change wallet or account' : 'Choose wallet'}</Button>
          {wallet.pickerChain !== null && <WalletAccountPicker chainId={1} purpose="Mainnet deployment" onConnected={wallet.connect} onCancel={wallet.closePicker} />}
          {session && <div className="deployment-actions"><Button variant="secondary" busy={busy.startsWith('Checking')} disabled={!!busy || blocked} onClick={() => void prepare()}>Check deployment and fees</Button></div>}
          {review && <div className="protocol-panel"><h3>Ready for your review</h3><p>Contract creation sends 0 ETH. Maximum reviewed network fee: <strong>{formatEther(BigInt(review.gas) * BigInt(review.maxFeePerGas))} ETH</strong>. The actual fee can be lower. This quote expires after 90 seconds.</p><Button busy={!!busy} disabled={!!busy || blocked} onClick={() => void deploy()}>Approve Mainnet deployment</Button></div>}
        </>}
      </>}
    </section>
    <section className="deployment-summary"><h2>Before Genesis opens</h2><p>Deployment creates a closed contract. The reviewed catalog contains 22 seasons and 216 collections. The first collection’s operating funding is 0.46 ETH: 0.25 ETH for randomness, 0.20 ETH for sponsored mints and 0.01 ETH for draw execution. This is separate from deployment gas and requires another approval.</p><p>The oracle reserve is a buffer, not a fixed service charge. Funding is checked again before each collection opens. Unused subscription funds are recovered after settlement. X delivery requires a separately verified Mainnet account and activation.</p><LinkButton href="/dashboard?chainId=1" variant="secondary">Back to season control</LinkButton></section>
    {result?.status === 'deployed' && <ProtocolExperience config={{version:18,chainId:1,controller:result.address,codeHash:result.codeHash,rpcUrl:'https://ethereum-rpc.publicnode.com'}} view="operations" catalog={mainnetCatalog} />}
    {notice && <FloatingNotice title={busy || 'Deployment update'} detail={notice} busy={!!busy} onDismiss={() => setNotice('')} />}
  </div>;
}
