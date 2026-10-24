import type { Page } from '@playwright/test';
import { Interface, toQuantity, parseEther } from 'ethers';
import { visualNow } from '../../apps/web/test/visual-data';
import ca from '../../packages/contracts/src/ManekinekoSeasonControllerV12.json';
import ra from '../../packages/contracts/src/ManekinekoRoundV12.json';
import va from '../../packages/contracts/src/ManekinekoVotingV12.json';
import ca13 from '../../packages/contracts/src/ManekinekoSeasonControllerV13.json';
import ha from '../../packages/contracts/src/ManekinekoHolderRewardsV13.json';
import wa from '../../packages/contracts/src/ManekinekoWinnerCreditsV8.json';
export const C = '0x' + '11'.repeat(20),
  V = '0x' + '22'.repeat(20),
  W = '0x' + '33'.repeat(20),
  R = '0x' + '44'.repeat(20),
  A = '0x' + '55'.repeat(20),
  T = '0x' + '66'.repeat(20),
  P = '0x' + '88'.repeat(20),
  H = '0x' + '77'.repeat(32);
export async function rpc(page: Page, phase = 0, badPin = false, settings: { deadline?: number; canFinalize?: boolean; operatingBalance?: string; randomnessDeadline?: number; drawTimeout?: boolean; duration?: number; affiliateId?: number; claimed?: boolean; legacy?: boolean; count?: number; holderState?: "locked" | "open" | "exhausted" | "empty"; holderClaimed?: boolean; holderOwner?: string; holderBadPin?: boolean } = {}) {
  const now = Math.floor(Date.parse(visualNow) / 1000),
    start = phase === 0 ? now + 3600 : now - 3600,
    deadline = settings.deadline ?? (phase === 7 ? now - 60 : now + 80000);
  const interfaces = [new Interface(ca), new Interface(ra), new Interface(va), new Interface(wa), new Interface(ca13), new Interface(ha)];
  await page.route('https://v12.fixture.invalid/**', async (route) => {
    const raw = route.request().postDataJSON();
    const answer = (q: any) => {
      let result: any;
      if (q.method === 'eth_getTransactionCount') result = '0x0';
      else if (q.method === 'eth_getTransactionByHash') result = null;
      else if (q.method === 'eth_chainId') result = '0xaa36a7';
      else if (q.method === 'eth_getCode') result = badPin || (settings.holderBadPin && q.params[0].toLowerCase() === P.toLowerCase()) ? '0x6001' : '0x6000';
      else if (q.method === 'eth_getBalance') result = toQuantity(parseEther(settings.operatingBalance ?? '1'));
      else if (q.method === 'eth_blockNumber') result = '0x10';
      else if (q.method === 'eth_getBlockByNumber')
        result = {
          number: '0x10',
          hash: H,
          parentHash: H,
          nonce: '0x0000000000000000',
          difficulty: '0x0',
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          miner: A,
          extraData: '0x',
          timestamp: toQuantity(now),
          transactions: [],
          baseFeePerGas: '0x1',
        };
      else if (q.method === 'eth_call') {
        for (const abi of interfaces) {
          let call;
          try {
            call = abi.parseTransaction({ data: q.params[0].data });
          } catch {
            continue;
          }
          if (!call) continue;
          const values: Record<string, any[]> = {
            collectionPlan: [[H, 'Rehearsal season', Number(call.args.length ? call.args[0] : 0) === 1 ? 'Fictional voting study' : `Fictional collection ${Number(call.args.length ? call.args[0] : 0) + 1}`, 'TEST', '#330000', '#FFFFFF']],
            operator: [A],
            voting: [V],
            credits: [W],
            catalogSealed: [true],
            roundCount: [settings.count ?? (settings.holderState ? settings.holderState === 'locked' ? 8 : 10 : 2)],
            catalogCount: [settings.holderState ? 10 : 3],
            preparationCost: [parseEther('0.04')],
            bootstrapAllowed: [false],
            legacySourceCount: [settings.legacy ? 1 : 0],
            legacySources: [R],
            rounds: [call.args.length > 0 && call.args[0] === 1n ? R : T],
            CONTRACT_VERSION: [settings.holderState ? q.params[0].to.toLowerCase() === P.toLowerCase() ? 'holder-rewards-v13' : 'affiliate-v13' : 'affiliate-v12'],
            holderRewards: [P], controller: [C], HOLDER_BPS: [800], COVERAGE_BPS: [500], seasonId: [H],
            fundedCollection: [settings.holderState !== 'empty'], claimed: [settings.holderClaimed ?? false],
            summary: [[settings.holderState === 'empty' ? 0 : parseEther('8'), settings.holderState === 'empty' ? 0 : 10000, settings.holderState === 'empty' ? 0 : 500, settings.holderState === 'empty' ? 0 : parseEther('0.016'), settings.holderState === 'exhausted' ? 500 : settings.holderState === 'open' ? 123 : 0, settings.holderState === 'exhausted' ? parseEther('8') : settings.holderState === 'open' ? parseEther('1.968') : 0, 10, settings.holderState === 'locked' ? 7 : 10, settings.holderState !== 'locked']],
            name: ['Fictional voting study'],
            seasonName: ['Rehearsal season'],
            collectionColor: ['#330000'],
            phase: [phase],
            maxSupply: [1000],
            mintPrice: [parseEther('0.01')],
            winnerCount: [6],
            totalMinted: [phase === 0 ? 0 : (phase >= 2 && phase <= 6) || settings.drawTimeout ? 1000 : 250],
            soldOutAt: [settings.drawTimeout ? now - 259260 : phase >= 2 && phase <= 6 ? now - 120 : 0],
            randomnessDeadline: [settings.randomnessDeadline ?? (settings.drawTimeout ? now - 60 : phase >= 2 && phase <= 6 ? now + 259080 : 0)],
            executionReserve: [parseEther('0.01')],
            executionRecipient: [phase === 5 || phase === 6 ? A : '0x'+'00'.repeat(20)],
            saleStartAt: [start],
            mintDeadline: [deadline],
            termsHash: [H],
            ballots: [now - 120, start, 3, 2],
            optionCount: [2],
            operatorWithdrawable: [phase === 5 ? parseEther('2') : 0],
            operatorAllocation: [phase >= 2 && phase <= 6 ? parseEther('2') : 0],
            operatorWithdrawn: [0],
            canFinalizeDraw: [settings.canFinalize ?? true],
            protectedBalance: [parseEther('2.5')],
            growthReserveBalance: [0],
            nextAvailableAffiliateId: [3],
            readyForNextRound: [phase === 5 || phase === 6],
            refundsAvailable: [phase === 7],
            votingPower: [3],
            sponsorBalance: [parseEther('0.02')],
            subscriptionClosed: [false],
            affiliateIdOf: [settings.affiliateId ?? 0],
            remainingMints: [20],
            affiliateClaimable: [settings.affiliateId && phase >= 5 && phase <= 6 ? parseEther('1') : 0],
            winningTokenIds: [call.args.length ? call.args[0] : 1],
            prizeAmountForRank: [parseEther('1')],
            prizeClaimed: [settings.claimed ?? phase === 6],
            ownerOf: [settings.holderOwner ?? A],
            votes: [call.args.length > 1 && call.args[1] === 0n ? 3 : 0],
          };
          if (call.name === 'option')
            result = abi.encodeFunctionResult(call.fragment, [
              [
                call.args.length > 1 && call.args[1] === 0n ? 1000 : 2000,
                parseEther(call.args.length > 1 && call.args[1] === 0n ? '0.01' : '0.02'),
                6,
                settings.duration ?? 86400,
              ],
            ]);
          else if (values[call.name]) result = abi.encodeFunctionResult(call.fragment, values[call.name]);
          else throw new Error(`Unmocked read ${call.name}`);
          break;
        }
      } else throw new Error(`Unmocked RPC ${q.method}`);
      if (result === undefined) throw new Error('Unknown call');
      return { jsonrpc: '2.0', id: q.id, result };
    };
    await route.fulfill({ json: Array.isArray(raw) ? raw.map(answer) : answer(raw) });
  });
}

export async function installRejectingWallet(page: Page, account = A) {
  await page.addInitScript(
    ({ address }) => {
      const submissions: unknown[] = [];
      const requests: unknown[] = [];
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      let activeAddress = address, activeChain = '0xaa36a7';
      const emit = (event: string, value: unknown) => { for (const listener of [...listeners.get(event) ?? []]) listener(value); };
      const provider = {
        on: (event: string, listener: (...args: unknown[]) => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); },
        removeListener: (event: string, listener: (...args: unknown[]) => void) => { listeners.get(event)?.delete(listener); },
        request: async (q: { method: string; params?: unknown[] }) => {
          requests.push(q);
          if (['eth_accounts', 'eth_requestAccounts'].includes(q.method)) return [activeAddress];
          if (q.method === 'eth_chainId') return activeChain;
          if (q.method === 'wallet_switchEthereumChain') { activeChain = (q.params![0] as { chainId: string }).chainId; emit('chainChanged', activeChain); return null; }
          if (q.method === 'wallet_getPermissions') return [];
          if (q.method === 'wallet_revokePermissions') return null;
          if (q.method === 'eth_estimateGas') return '0x100000';
          if (q.method === 'eth_sendTransaction') {
            submissions.push(q.params);
            throw Object.assign(new Error('User rejected'), { code: 4001 });
          }
          return (
            await (
              await fetch('https://v12.fixture.invalid/', {
                method: 'POST',
                body: JSON.stringify({ ...q, id: 1, jsonrpc: '2.0' }),
                headers: { 'content-type': 'application/json' },
              })
            ).json()
          ).result;
        },
      };
      Object.assign(window, { __v12Submissions: submissions, __v12WalletRequests: requests,
        __v12ChangeAccount: (next: string) => { activeAddress = next; emit('accountsChanged', [next]); },
        __v12ChangeChain: (next: string) => { activeChain = next; emit('chainChanged', next); },
      });
      window.addEventListener('eip6963:requestProvider', () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: {
                uuid: '12121212-1212-4212-8212-121212121212',
                name: 'V12 fixture wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'invalid.v12',
              },
              provider,
            },
          })
        )
      );
    },
    { address: account }
  );
}
