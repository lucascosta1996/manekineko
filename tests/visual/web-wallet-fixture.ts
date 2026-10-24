import { expect, type Page } from '@playwright/test';
import { A } from './v12-rpc';

/** Exercise the real Reown modal and Ethers adapter with an isolated EIP-6963 wallet. */
export async function connectWebWallet(page: Page, address = A) {
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByText('V12 fixture wallet', { exact: true }).click();
  await expect(page.getByRole('button', { name: `Manage wallet ${address} on Sepolia testnet` })).toBeVisible();
}
