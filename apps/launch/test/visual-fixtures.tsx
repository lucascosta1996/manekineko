'use client';
/** Isolated production UI. Every RPC and wallet write is intercepted by Playwright. */
import { keccak256 } from 'ethers';
import { ProtocolExperience } from '@manekineko/protocol/experience';
import { SocialPreview } from '../components/social-preview';
import { LaunchLogin } from '../components/launch/launch-login';
import { SocialAccount } from '../components/social-account';
import { OperatorShell } from '../components/operator-shell';
import sepolia from '../catalog/sepolia.json';
import mainnet from '../catalog/mainnet.json';
import LaunchError from '../app/error';
import NotFound from '../app/not-found';
import Loading from '../app/loading';
export const launchVisualRoutes = ['/login', '/dashboard', '/social', '/social/account'] as const;
export function LaunchVisualFixture({ path, state, chainId = 11155111, destination = '/dashboard' }: { path: string; state?: string; chainId?: number; destination?: string }) {
  if (path === '/login') return <OperatorShell authenticated={false}><LaunchLogin destination={destination} /></OperatorShell>;
  if (path === '/social/account') return <OperatorShell chainId={chainId} section="social/account"><SocialAccount key={chainId} chainId={chainId} /></OperatorShell>;
  if (path === '/social') return <OperatorShell chainId={chainId} section="social"><SocialPreview catalog={chainId === 1 ? mainnet : sepolia} /></OperatorShell>;
  if (path === '/not-found') return <NotFound />;
  if (path === '/loading') return <Loading />;
  if (path === '/error') return <LaunchError error={new Error('Fixture failure')} retry={() => window.location.reload()} />;
  return <OperatorShell chainId={chainId}><ProtocolExperience key={chainId} view="operations" catalog={chainId === 1 ? mainnet : sepolia} config={state === 'unconfigured' ? null : { chainId, controller: '0x1111111111111111111111111111111111111111', codeHash: keccak256('0x6000'), rpcUrl: 'https://v12.fixture.invalid', ...(state === 'v14' ? { version: 14 as const, holderRewardsCodeHash: keccak256('0x6000'), genesisCodeHash: keccak256('0x6000') } : {}) }} /></OperatorShell>;
}
