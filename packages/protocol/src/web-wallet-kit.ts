"use client";

type AppKit = ReturnType<typeof import("@reown/appkit")["createAppKit"]>;
let instance: Promise<AppKit> | null = null;

/** One Reown instance for the entire Web app, including client-side route changes. */
export function webWalletKit(projectId: string, chainId: number): Promise<AppKit> {
  if (!projectId.trim()) return Promise.reject(new Error("Wallet connections are temporarily unavailable. Please try again later."));
  if (!instance) instance = (async () => {
    const [{ createAppKit }, { EthersAdapter }, { mainnet, sepolia }] = await Promise.all([
      import("@reown/appkit"), import("@reown/appkit-adapter-ethers"), import("@reown/appkit/networks"),
    ]);
    const modal = createAppKit({
      projectId: projectId.trim(), adapters: [new EthersAdapter()], networks: [mainnet, sepolia],
      defaultNetwork: chainId === 11155111 ? sepolia : mainnet,
      metadata: { name: "Tincta Rewards", description: "Tincta NFT collections and rewards", url: window.location.origin, icons: [`${window.location.origin}/icon.svg`] },
      enableInjected: true, enableEIP6963: true, enableWalletConnect: true, enableReconnect: true,
      enableCoinbase: false, enableBaseAccount: false, allowUnsupportedChain: true,
      defaultAccountTypes: { eip155: "eoa" },
      features: { analytics: false, email: false, socials: [], swaps: false, onramp: false, send: false },
      themeMode: "light", themeVariables: { "--w3m-border-radius-master": "1px", "--w3m-accent": "#171717", "--w3m-font-family": "var(--ui-font-sans)", "--w3m-z-index": 1000 },
    });
    await modal.ready();
    return modal;
  })().catch(error => { instance = null; throw error; });
  return instance;
}
