"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Contract,
  JsonRpcProvider,
  WebSocketProvider,
  ZeroAddress,
  formatEther,
  getAddress,
  parseEther,
  type TransactionRequest,
} from "ethers";
import { Button } from "@manekineko/ui/button";
import { Disclosure } from "@manekineko/ui/components";
import {
  PublicWorkspace,
  type PublicView,
  formatDuration,
} from "./public-workspace";
import { Field, Input, Radio } from "@manekineko/ui/forms";
import { ConfirmProvider, useConfirm } from "@manekineko/ui/confirm";
import { WalletAccountPicker } from "./wallet-account-picker";
import { useWalletSession } from "./use-wallet-session";
import { assertWallet, shortWallet, walletError } from "./wallet";
import {
  controllerAbi,
  roundAbi,
  votingAbi,
  creditsAbi,
  integerInput,
  readProtocol,
  verifyController,
  type Snapshot,
} from "./chain";
import type { ProtocolConfig } from "./config";
import "./protocol.css";
import { OperatorWorkspace } from "./operator-workspace";
import { operatorActions } from "./operator-actions";
import { readCatalog, type Catalog } from "./progress";
import { HolderRewardsPanel } from "./holder-rewards-panel";
import { holderClaimTransaction, verifyHolderPool } from "./holder-rewards";

type View = PublicView | "operations";
type Pending = {
  label: string;
  hash?: string;
  to: string;
  data: string;
  value: string;
  nonce: number;
  chainId: number;
  wallet: string;
};
const eth = (n: bigint) => `${formatEther(n)} ETH`;
const date = (n: bigint) =>
  new Date(Number(n) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
/** Observe client navigation as well as direct referral URLs without suspending the page shell. */
function QuerySelection({
  setSelected,
  setAffiliate,
}: {
  setSelected: (id: number) => void;
  setAffiliate: (id: string) => void;
}) {
  const params = useSearchParams();
  const id = params.get("collection"),
    ref = params.get("affiliate");
  useEffect(() => {
    setSelected(id && /^[1-9][0-9]{0,2}$/.test(id) ? Number(id) : 0);
    setAffiliate(ref && /^(0|[1-9]|10)$/.test(ref) ? ref : "0");
  }, [id, ref, setSelected, setAffiliate]);
  return null;
}
export function ProtocolExperience({
  config,
  view,
  catalog: plannedCatalog = null,
}: {
  config: ProtocolConfig | null;
  view: View;
  catalog?: Catalog | null;
}) {
  return (
    <ConfirmProvider>
      <Experience config={config} view={view} plannedCatalog={plannedCatalog} />
    </ConfirmProvider>
  );
}
function Experience({
  config,
  view,
  plannedCatalog,
}: {
  config: ProtocolConfig | null;
  view: View;
  plannedCatalog: Catalog | null;
}) {
  const wallet = useWalletSession(),
    requestConfirmation = useConfirm();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [state, setState] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [retrying, setRetrying] = useState(false),
    [message, setMessage] = useState("");
  const [selected, setSelected] = useState(0),
    [sourcePage, setSourcePage] = useState(0),
    [choice, setChoice] = useState(0);
  const [quantity, setQuantity] = useState("1"),
    [affiliate, setAffiliate] = useState("0"),
    [token, setToken] = useState("1");
  const [rewardSource, setRewardSource] = useState("");
  const [source, setSource] = useState(""),
    [sourceToken, setSourceToken] = useState("1"),
    [rank, setRank] = useState("1");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(null),
    [recoveryHash, setRecoveryHash] = useState("");
  const locked = useRef(false),
    generation = useRef(0),
    liveSession = useRef(wallet.session);
  liveSession.current = wallet.session;
  const provider = useMemo(
    () =>
      config
        ? new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: 0 })
        : null,
    [config]
  );
  const key =
    config && wallet.session
      ? `tincta:v${config.version ?? 12}:${config.chainId}:${config.controller}:${wallet.session.address}`
      : null;
  useEffect(
    () => () => {
      provider?.destroy();
    },
    [provider]
  );
  const refresh = useCallback(async () => {
    if (!provider || !config) return;
    const version = ++generation.current;
    try {
      const next = await readProtocol(
        provider,
        config,
        selected,
        wallet.session?.address,
        sourcePage
      );
      const nextCatalog =
        view === "operations"
          ? await readCatalog(provider, config, next)
          : null;
      if (version === generation.current) {
        setCatalog(nextCatalog);
        setState(next);
        setError("");
      }
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to read the network."
        );
    }
  }, [provider, config, selected, wallet.session, sourcePage, view]);
  useEffect(() => {
    setState(null);
    setError("");
    void refresh();
    // HTTP polling remains available if a provider cannot deliver block subscriptions.
    const timer = setInterval(() => {
      void refresh();
    }, 12_000);
    return () => {
      clearInterval(timer);
      ++generation.current;
    };
  }, [refresh]);
  useEffect(() => {
    if (!config?.websocketUrl) return;
    const subscription = new WebSocketProvider(config.websocketUrl);
    void subscription
      .on("block", () => {
        void refresh();
      })
      .catch(() => {});
    void subscription.on("error", () => {}).catch(() => {});
    // Block notifications accelerate refresh; HTTP polling remains authoritative on disconnect.
    return () => {
      void subscription.destroy().catch(() => {});
    };
  }, [config?.websocketUrl, refresh]);
  useEffect(() => {
    const sync = () => {
      try {
        const saved = key
          ? JSON.parse(localStorage.getItem(key) ?? "null")
          : null;
        if (
          saved &&
          (!config ||
            saved.chainId !== config.chainId ||
            saved.wallet?.toLowerCase() !==
              wallet.session?.address.toLowerCase() ||
            !Number.isSafeInteger(saved.nonce) ||
            saved.nonce < 0 ||
            typeof saved.label !== "string" ||
            !/^0x[0-9a-f]{40}$/i.test(saved.to) ||
            !/^0x(?:[0-9a-f]{2})*$/i.test(saved.data) ||
            !/^(0|[1-9][0-9]*)$/.test(saved.value) ||
            (saved.hash && !/^0x[0-9a-f]{64}$/i.test(saved.hash)))
        )
          throw new Error("Invalid saved intent");
        setPending(saved);
      } catch {
        setError(
          "Transaction history could not be loaded. Restore browser storage before signing."
        );
      }
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const clearPending = useCallback(() => {
    if (key) localStorage.removeItem(key);
    setPending(null);
  }, [key]);
  useEffect(() => {
    if (!pending?.hash || !provider) return;
    let stopped = false;
    const check = async () => {
      try {
        const receipt = await provider.getTransactionReceipt(pending.hash!);
        if (!stopped && receipt) {
          clearPending();
          setMessage(
            receipt.status === 1
              ? `${pending.label} confirmed.`
              : `${pending.label} reverted. No payment was completed.`
          );
          void refresh();
        }
      } catch {
        /* Keep the submitted transaction; connection failure never permits a duplicate. */
      }
    };
    void check();
    const timer = setInterval(() => {
      void check();
    }, 8_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, provider, clearPending, refresh]);

  async function submit(
    label: string,
    description: string,
    build: (s: Snapshot, address: string) => Promise<TransactionRequest>
  ) {
    if (!key) return;
    if (!navigator.locks) {
      setMessage(
        "This browser cannot safely coordinate wallet requests. Use an up-to-date secure browser."
      );
      return;
    }
    await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        setMessage(
          "Another tab is reviewing a transaction for this wallet. Finish it there first."
        );
        return;
      }
      await submitLocked(label, description, build);
    });
  }
  async function submitLocked(
    label: string,
    description: string,
    build: (s: Snapshot, address: string) => Promise<TransactionRequest>
  ) {
    const session = wallet.session;
    if (
      !session ||
      !config ||
      !provider ||
      !key ||
      locked.current ||
      pending ||
      error
    )
      return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    let intentWritten = false;
    try {
      if (localStorage.getItem(key))
        throw new Error(
          "Resolve the pending transaction before signing again."
        );
      await assertWallet(session);
      if (session.chainId !== config.chainId)
        throw new Error("Connect to the collection network.");
      const fresh = await readProtocol(
        provider,
        config,
        selected,
        session.address,
        sourcePage
      );
      if (state?.round && fresh.round?.address !== state.round.address)
        throw new Error(
          "The selected collection changed. Refresh and review it again."
        );
      const walletController = await verifyController(session.provider, config);
      const [walletVoting, walletCredits, walletRound] = await Promise.all([
        walletController.voting(),
        walletController.credits(),
        fresh.round
          ? walletController.rounds(fresh.round.id)
          : Promise.resolve(null),
      ]);
      if (
        getAddress(walletVoting) !== getAddress(fresh.voting) ||
        getAddress(walletCredits) !== getAddress(fresh.credits) ||
        (fresh.round && getAddress(walletRound) !== fresh.round.address)
      )
        throw new Error(
          "The wallet and display providers disagree about this collection."
        );
      const tx = await build(fresh, session.address);
      if (fresh.holders) {
        const pool = await verifyHolderPool(session.provider, config);
        if (getAddress(await pool.getAddress()) !== fresh.holders.address) throw new Error("The wallet and display providers disagree about the holder pool.");
      }
      if (
        !(await requestConfirmation({
          title: label,
          description,
          confirmLabel: "Continue to wallet",
        }))
      )
        return;
      if (liveSession.current !== session)
        throw new Error("Reconnect your wallet before continuing.");
      await assertWallet(session);
      const reviewed = await readProtocol(
        provider,
        config,
        selected,
        session.address,
        sourcePage
      );
      const checked = await build(reviewed, session.address);
      if (
        reviewed.count !== fresh.count ||
        reviewed.round?.termsHash !== fresh.round?.termsHash ||
        String(checked.to) !== String(tx.to) ||
        checked.data !== tx.data ||
        BigInt(checked.value ?? 0) !== BigInt(tx.value ?? 0)
      )
        throw new Error(
          "The reviewed action changed. Refresh and review it again."
        );
      if (localStorage.getItem(key))
        throw new Error(
          "Another transaction needs to be resolved before signing."
        );
      // Simulation uses the selected wallet RPC, independently of the display RPC.
      if (
        ![
          config.controller,
          fresh.voting,
          fresh.credits,
          fresh.round?.address,
          fresh.holders?.address,
        ].some((a) => a?.toLowerCase() === String(tx.to).toLowerCase())
      ) {
        if (
          !(await new Contract(
            walletVoting,
            votingAbi,
            session.provider
          ).legacySource(getAddress(String(tx.to))))
        )
          throw new Error("Unrecognized transaction target.");
      }
      tx.chainId = config.chainId;
      const gas = await session.signer.estimateGas(tx);
      await assertWallet(session);
      if (liveSession.current !== session)
        throw new Error("Your wallet changed. Review again.");
      const nonce = await session.signer.getNonce("pending");
      const intent: Pending = {
        nonce,
        chainId: config.chainId,
        wallet: session.address,
        label,
        to: String(tx.to),
        data: String(tx.data ?? "0x"),
        value: String(tx.value ?? 0),
      };
      localStorage.setItem(key, JSON.stringify(intent));
      intentWritten = true;
      setPending(intent);
      const sent = await session.signer.sendTransaction({
        ...tx,
        nonce,
        from: session.address,
        gasLimit: (gas * 120n) / 100n,
      });
      const submitted = { ...intent, hash: sent.hash };
      localStorage.setItem(key, JSON.stringify(submitted));
      setPending(submitted);
      setMessage("Transaction submitted. Waiting for its receipt.");
    } catch (e) {
      if (
        intentWritten &&
        ["ACTION_REJECTED", "4001"].includes(
          String((e as { code?: unknown }).code)
        )
      )
        clearPending();
      setMessage(walletError(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function onRound(
    label: string,
    description: string,
    method: string,
    args: (s: Snapshot, address: string) => unknown[],
    value = (_s: Snapshot) => 0n
  ) {
    return submit(label, description, async (s, address) => {
      if (!s.round) throw new Error("Select a prepared collection.");
      return new Contract(s.round.address, roundAbi)
        .getFunction(method)
        .populateTransaction(...args(s, address), { value: value(s) });
    });
  }
  async function recover() {
    if (!pending || !key || !provider || !wallet.session) return;
    try {
      const tx = await provider.getTransaction(recoveryHash);
      if (
        !tx ||
        tx.from.toLowerCase() !== wallet.session.address.toLowerCase() ||
        tx.to?.toLowerCase() !== pending.to.toLowerCase() ||
        tx.data !== pending.data ||
        tx.value !== BigInt(pending.value) ||
        tx.nonce !== pending.nonce ||
        tx.chainId !== BigInt(pending.chainId)
      )
        throw new Error("This hash does not match the pending action.");
      const next = { ...pending, hash: tx.hash };
      localStorage.setItem(key, JSON.stringify(next));
      setPending(next);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to find that transaction."
      );
    }
  }
  const r = state?.round,
    disabled = !wallet.session || wallet.session.chainId !== config?.chainId || busy || !!pending || !!error || !state;
  const canVote =
    !!r &&
    !!state &&
    state.timestamp >= Number(r.voteStart) &&
    state.timestamp < Number(r.start);
  const votingSources = state?.sources.filter((s) => s.power > 0n) ?? [];
  const power = votingSources.reduce((n, s) => n + s.power, 0n);
  const operator =
    !!state &&
    wallet.session?.address.toLowerCase() === state.operator.toLowerCase();
  const field = (
    label: string,
    value: string,
    set: (s: string) => void,
    hint?: string
  ) => (
    <Field label={label} hint={hint}>
      {(p) => (
        <Input
          {...p}
          value={value}
          onChange={(e) => set(e.target.value)}
          autoComplete="off"
        />
      )}
    </Field>
  );
  const explorer = (address: string) =>
    `https://${
      config?.chainId === 11155111 ? "sepolia." : ""
    }etherscan.io/address/${address}`;
  const votePanel = r && state && (
    <>
      <section className="protocol-panel">
        <h2>
          {canVote
            ? "Cast your vote"
            : state.timestamp < Number(r.voteStart)
            ? "Voting opens soon"
            : "Voting has closed"}
        </h2>
        <p>Pick one package. One eligible NFT, one vote.</p>
        <div className="protocol-options">
          {r.options.map((o, i) => (
            <div className="protocol-option" key={i}>
              <Radio
                name="terms"
                checked={choice === i}
                onChange={() => setChoice(i)}
                disabled={!canVote || busy}
                label={`Option ${i + 1}${i === 0 ? " · fallback" : ""}`}
              />
              <dl>
                <div>
                  <dt>Price</dt>
                  <dd>{eth(o.price)}</dd>
                </div>
                <div>
                  <dt>Supply</dt>
                  <dd>{String(o.supply)}</dd>
                </div>
                <div>
                  <dt>Equal prizes</dt>
                  <dd>{String(o.winners)}</dd>
                </div>
                <div>
                  <dt>Mint window</dt>
                  <dd>{formatDuration(o.duration)}</dd>
                </div>
                <div>
                  <dt>Votes</dt>
                  <dd>{String(o.votes)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        <p>
          {wallet.session
            ? `${power} unused votes in this source group.`
            : "Connect to see your snapshot voting power."}{" "}
        </p>
        {state.sourceCount > 16 && (
          <div className="protocol-actions">
            <Button
              variant="ghost"
              disabled={sourcePage === 0}
              onClick={() => setSourcePage(sourcePage - 1)}
            >
              Previous sources
            </Button>
            <span>
              Group {sourcePage + 1} of {Math.ceil(state.sourceCount / 16)}
            </span>
            <Button
              variant="ghost"
              disabled={(sourcePage + 1) * 16 >= state.sourceCount}
              onClick={() => setSourcePage(sourcePage + 1)}
            >
              Next sources
            </Button>
          </div>
        )}
        <Button
          disabled={disabled || !canVote || power === 0n}
          onClick={() =>
            void submit(
              "Cast vote",
              `Use ${power} votes for option ${
                choice + 1
              }. Votes cannot be changed. Other source groups can be voted separately.`,
              async (s) =>
                new Contract(s.voting, votingAbi).castVote.populateTransaction(
                  s.round!.address,
                  choice,
                  s.sources.filter((x) => x.power > 0n).map((x) => x.address)
                )
            )
          }
        >
          Vote for option {choice + 1}
        </Button>
        <Disclosure title="Voting eligibility & rules">
          <p>
            Snapshot: {date(r.voteStart - 1n)}. Voting closes: {date(r.start)}.
            Minting then opens without another operator signature.
          </p>
          <p>
            Only NFTs from successfully revealed collections qualify. A transfer
            after the snapshot does not create another vote. Votes cannot be
            changed.
          </p>
          <p>
            No votes: option 1 wins. Ties: the lowest numbered tied option wins.
            All choices are published before voting opens.
          </p>
        </Disclosure>
      </section>
    </>
  );
  const vaultPanel = r && state && !!state.legacy.length && (
    <section className="protocol-panel">
      <h2>Voting with earlier Tincta NFTs</h2>
      <p>
        Earlier contracts cannot record historical ownership. Deposit an
        eligible NFT before the snapshot to enable voting, then withdraw
        whenever you choose. Prize claims must be settled before depositing
        winning tickets.
      </p>
      {field("Eligible collection address", source, setSource)}
      {field("NFT number", sourceToken, setSourceToken)}
      <div className="protocol-actions">
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            void submit(
              "Approve this NFT",
              "Allow the voting vault to transfer only this NFT. This does not deposit it.",
              async (s) => {
                if (
                  !s.legacy.some(
                    (x) => x.toLowerCase() === source.toLowerCase()
                  )
                )
                  throw new Error(
                    "This collection is not registered for legacy voting."
                  );
                return new Contract(getAddress(source), [
                  "function approve(address,uint256)",
                ]).approve.populateTransaction(
                  s.voting,
                  integerInput(sourceToken)
                );
              }
            )
          }
        >
          Approve NFT
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            void submit(
              "Deposit NFT for voting",
              "Your NFT moves into the voting vault. You can withdraw it at any time.",
              async (s) =>
                new Contract(
                  s.voting,
                  votingAbi
                ).depositLegacy.populateTransaction(getAddress(source), [
                  integerInput(sourceToken),
                ])
            )
          }
        >
          Deposit NFT
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            void submit(
              "Withdraw NFT",
              "Return this deposited NFT to your connected wallet.",
              async (s) =>
                new Contract(
                  s.voting,
                  votingAbi
                ).withdrawLegacy.populateTransaction(getAddress(source), [
                  integerInput(sourceToken),
                ])
            )
          }
        >
          Withdraw NFT
        </Button>
      </div>
    </section>
  );
  const mintPanel = r && state && (
    <section className="protocol-panel">
      <h2>Mint a ticket</h2>
      <p>
        {wallet.session
          ? `${r.remaining} primary mints remaining for this wallet.`
          : "Up to 20 primary mints per wallet."}
      </p>
      <Field
        label="Number of tickets"
        hint="Choose 1–20, within your remaining mint allowance."
        error={
          !/^([1-9]|1[0-9]|20)$/.test(quantity)
            ? "Enter a whole number from 1 to 20."
            : BigInt(quantity) > r.supply - r.minted
            ? "There are fewer tickets remaining in this collection."
            : wallet.session && BigInt(quantity) > r.remaining
            ? "This exceeds your remaining mint allowance."
            : undefined
        }
      >
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoComplete="off"
          />
        )}
      </Field>
      <Disclosure
        title={
          affiliate === "0"
            ? "Have an affiliate link?"
            : `Affiliate position ${affiliate} applied`
        }
      >
        {field(
          "Affiliate position",
          affiliate,
          setAffiliate,
          "Your referral link fills this in. Use 0 for a direct mint."
        )}
      </Disclosure>
      <p>
        Total, before network fees:{" "}
        {/^([1-9]|1[0-9]|20)$/.test(quantity)
          ? eth(r.price * BigInt(quantity))
          : "Enter 1–20 tickets"}
      </p>
      <Button
        disabled={
          disabled ||
          r.phase !== 1 ||
          !/^([1-9]|1[0-9]|20)$/.test(quantity) ||
          !/^(0|[1-9]|10)$/.test(affiliate) ||
          (/^([1-9]|1[0-9]|20)$/.test(quantity) &&
            (BigInt(quantity) > r.supply - r.minted ||
              (!!wallet.session && BigInt(quantity) > r.remaining)))
        }
        onClick={() =>
          void onRound(
            "Mint tickets",
            `Mint ${quantity} tickets for ${
              /^([1-9]|1[0-9]|20)$/.test(quantity)
                ? eth(r.price * BigInt(quantity))
                : "the displayed price"
            }, plus network gas.`,
            "mintQuoted",
            (s, a) => {
              if (s.round!.termsHash !== r.termsHash)
                throw new Error(
                  "The terms changed. Refresh and review the price again."
                );
              return [
                a,
                integerInput(quantity, 1n, 20n),
                integerInput(affiliate, 0n, 10n),
                r.termsHash,
              ];
            },
            (s) => s.round!.price * integerInput(quantity, 1n, 20n)
          )
        }
      >
        Mint tickets
      </Button>
    </section>
  );
  const affiliatePanel = r && state && (
    <section className="protocol-panel">
      <h2>Invite people. Share the rewards.</h2>
      <p>
        20% of mint funds is shared equally among qualified affiliates after a
        successful draw. With three qualified affiliates, each receives one
        third of that pool. Unfilled positions do not dilute your share.
      </p>
      {r.affiliateId > 0n ? (
        <>
          <p>
            Your position: {String(r.affiliateId)}. At least one paid referral
            qualifies you for an equal share of the 20% affiliate pool after the
            draw is finalized.
          </p>
          <a href={`/?collection=${r.id}&affiliate=${r.affiliateId}`}>
            Your referral link
          </a>
          <div className="protocol-actions">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(
                      `/?collection=${r.id}&affiliate=${r.affiliateId}`,
                      window.location.origin
                    ).href
                  );
                  setMessage("Referral link copied.");
                } catch {
                  setMessage(
                    "Copy is unavailable. Use the referral link above to copy its address."
                  );
                }
              }}
            >
              Copy referral link
            </Button>
          </div>
          <p>Claimable: {eth(r.affiliateAvailable)}</p>
          <p className="protocol-note">
            Equal shares become claimable after draw finalization. Until then,
            all mint receipts remain reserved for a possible refund.
          </p>
          <Button
            disabled={disabled || r.affiliateAvailable === 0n}
            onClick={() =>
              void onRound(
                "Claim affiliate reward",
                `Claim ${eth(r.affiliateAvailable)} to your connected wallet.`,
                "claimAffiliateCommission",
                (_, a) => [a]
              )
            }
          >
            Claim affiliate reward
          </Button>
        </>
      ) : (
        <>
          <p>
            {!canVote
              ? "Enrollment is closed for this collection."
              : r.nextSlot === 0n
              ? "All affiliate positions are filled."
              : `Enrollment is open. Position ${r.nextSlot} is available until minting opens.`}{" "}
            At least one paid referral is required to qualify.
          </p>
          {canVote && r.nextSlot > 0n && !(state.bootstrap && r.id === 1) && (
            <>
              {field("Qualifying collection address", source, setSource)}
              {field("Qualifying NFT number", sourceToken, setSourceToken)}
            </>
          )}
          <Button
            disabled={disabled || !canVote || r.nextSlot === 0n}
            onClick={() =>
              void onRound(
                "Enroll as an affiliate",
                `Reserve affiliate position ${r.nextSlot}. Enrollment does not guarantee a reward; at least one paid referral is required.`,
                "enrollAffiliate",
                () => [
                  r.nextSlot,
                  state.bootstrap && r.id === 1
                    ? ZeroAddress
                    : getAddress(source),
                  state.bootstrap && r.id === 1 ? 0 : integerInput(sourceToken),
                ]
              )
            }
          >
            {!canVote
              ? "Enrollment closed"
              : r.nextSlot === 0n
              ? "No positions available"
              : `Enroll for position ${r.nextSlot}`}
          </Button>
        </>
      )}
    </section>
  );
  const awardsPanel = r && state && (
    <section className="protocol-panel">
      <h2 id="winning-tickets">Winning tickets</h2>
      <p>
        All winning NFTs and their current holder addresses. Only the current
        holder can claim an unclaimed prize. An address shown after a transfer
        may differ from the wallet that received an earlier payment.
      </p>
      {r.phase === 2 && (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            void onRound(
              "Request the draw",
              "Retry the VRF request before the fixed randomness deadline. An accepted request cannot be replaced.",
              "requestRandomness",
              () => []
            )
          }
        >
          Request the draw
        </Button>
      )}
      {r.phase === 4 && (
        <>
          <p>
            Anyone can finish this draw. The executor earns{" "}
            {eth(r.executionReserve)} from separate operating funds. Network
            fees are paid by the executor.
          </p>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              void onRound(
                "Finalize draw & collect reward",
                `Process the fixed draw and collect ${eth(
                  r.executionReserve
                )} to your connected wallet if finalization succeeds. A bounded progress-only call pays no reward yet.`,
                "finalizeDrawAndClaim",
                (_, address) => [address]
              )
            }
          >
            Finalize draw & collect reward
          </Button>
        </>
      )}
      {r.executionReserve > 0n &&
        r.executionRecipient.toLowerCase() ===
          wallet.session?.address.toLowerCase() && (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              void onRound(
                "Claim executor reward",
                `Claim ${eth(
                  r.executionReserve
                )} of separate execution funding.`,
                "claimExecutionReward",
                (_, address) => [address]
              )
            }
          >
            Claim executor reward
          </Button>
        )}
      {r.awards.length ? (
        r.awards.map((a) => (
          <div className="protocol-award" key={a.rank}>
            <div className="public-winner-details">
              <h3>
                Prize {a.rank} · NFT #{String(a.tokenId)}
              </h3>
              <p>
                {eth(a.amount)}{" "}
                <span className="protocol-note">
                  · {a.claimed ? "Prize claimed" : "Available to claim"}
                </span>
              </p>
              <p className="protocol-note">
                Current NFT holder
                {a.holder.toLowerCase() ===
                wallet.session?.address.toLowerCase()
                  ? " · You"
                  : ""}
              </p>
              <a
                className="public-holder"
                href={explorer(a.holder)}
                target="_blank"
                rel="noreferrer"
              >
                {a.holder}
              </a>
            </div>
            <Button
              variant="secondary"
              disabled={
                disabled ||
                a.claimed ||
                a.holder.toLowerCase() !== wallet.session?.address.toLowerCase()
              }
              onClick={() =>
                void onRound(
                  "Claim prize",
                  `Claim ${eth(a.amount)} to your connected wallet.`,
                  "claimPrizeForRank",
                  (_, address) => [a.rank, address]
                )
              }
            >
              {a.claimed ? "Claimed" : "Claim prize"}
            </Button>
          </div>
        ))
      ) : (
        <p>
          The draw becomes available after sellout. Only the winning NFT holder
          can claim.
        </p>
      )}
    </section>
  );
  const refundPanel = r && state && (
    <section className="protocol-panel">
      <h2>Claim your refund</h2>
      <p>
        If the collection is unsold at its mint deadline, or no randomness is
        recorded within 72 hours of sellout, the current holder can recover the
        full mint price. Refunding burns the ticket. Randomness recorded on time
        permanently commits the draw.
      </p>
      {field("NFT number", token, setToken)}
      <Button
        variant="secondary"
        disabled={disabled || r.phase !== 7}
        onClick={() =>
          void onRound(
            "Refund ticket",
            `Burn NFT #${token} and receive ${eth(
              r.price
            )} in your connected wallet.`,
            "refund",
            (_, a) => [integerInput(token), a]
          )
        }
      >
        Refund ticket
      </Button>
    </section>
  );
  const sponsoredPanel = r && state && (
    <section className="protocol-panel">
      <h2>Your sponsored ticket</h2>
      <p>
        A settled winning NFT earns a sponsored mint in a later collection. One
        redeemed ticket per wallet, for life.
      </p>
      {field("Winning collection address", rewardSource, setRewardSource)}
      {field("Prize position", rank, setRank)}
      <Button
        variant="secondary"
        disabled={disabled || r.phase !== 1}
        onClick={() =>
          void submit(
            "Redeem sponsored ticket",
            "Redeem your lifetime reward into this collection. This consumes your one lifetime sponsored mint.",
            async (s) =>
              new Contract(
                s.credits,
                creditsAbi
              ).claimAndRedeemAward.populateTransaction(
                getAddress(rewardSource),
                integerInput(rank, 1n, 10n),
                s.round!.address
              )
          )
        }
      >
        Redeem sponsored ticket
      </Button>
    </section>
  );

  const status = config && (
    <>
      <Suspense fallback={null}>
        <QuerySelection setSelected={setSelected} setAffiliate={setAffiliate} />
      </Suspense>
      {!wallet.managed && <div className="protocol-toolbar">
        <span>
          {wallet.session
            ? shortWallet(wallet.session.address)
            : "Connect your wallet to participate."}
        </span>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            wallet.session
              ? wallet.disconnect()
              : wallet.openPicker(config.chainId)
          }
        >
          {wallet.session ? "Disconnect" : "Connect wallet"}
        </Button>
      </div>}
      {!wallet.managed && wallet.pickerChain !== null && (
        <WalletAccountPicker
          purpose="onchain seasons"
          chainId={wallet.pickerChain}
          onConnected={wallet.connect}
          onCancel={wallet.closePicker}
        />
      )}
      {!wallet.managed && wallet.notice && (
        <p className="protocol-note" role="status">
          {wallet.notice}
        </p>
      )}
      {wallet.managed && !wallet.account && <p className="protocol-note">Connect your wallet in the header to participate.</p>}
      {wallet.managed && wallet.account && wallet.account.chainId !== config.chainId && <p className="protocol-note" role="status">Switch your wallet to {config.chainId === 1 ? "Ethereum" : "Sepolia testnet"} using the header to continue.</p>}
      {error && (
        <div className="protocol-panel" role="alert">
          <p>{error}</p>
          {state && (
            <p>
              Showing the last verified snapshot. Signing is paused until a
              fresh read succeeds.
            </p>
          )}
          <Button
            variant="secondary"
            busy={retrying}
            busyLabel="Reading network"
            onClick={async () => {
              if (retrying) return;
              setRetrying(true);
              try {
                await refresh();
              } finally {
                setRetrying(false);
              }
            }}
          >
            Retry network read
          </Button>
        </div>
      )}
      {!state && !error && (
        <p role="status">Reading the collection contracts…</p>
      )}
      {message && (
        <p className="protocol-feedback" role="status">
          {message}
        </p>
      )}
      {pending && (
        <section className="protocol-panel">
          <h2>
            {pending.hash ? "Confirming transaction" : "Check your wallet"}
          </h2>
          <p>
            {pending.label}.{" "}
            {pending.hash
              ? "This action stays locked until a receipt is found."
              : "A signature was requested. Do not submit it again. If your wallet broadcast the transaction, enter its hash to recover the receipt."}
          </p>
          {pending.hash ? (
            <p className="protocol-address">{pending.hash}</p>
          ) : (
            <>
              {field("Transaction hash", recoveryHash, setRecoveryHash)}
              <Button variant="secondary" onClick={() => void recover()}>
                Find receipt
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (
                    await requestConfirmation({
                      title: "Dismiss unsigned request?",
                      description:
                        "Only continue if your wallet confirms that you rejected the request and no transaction was broadcast. A broadcast transaction must be recovered by its hash.",
                      confirmLabel: "I rejected it in my wallet",
                    })
                  )
                    clearPending();
                }}
              >
                I rejected the signature
              </Button>
            </>
          )}
        </section>
      )}
    </>
  );
  if (view !== "operations")
    return (
      <PublicWorkspace
        view={view}
        state={state}
        configured={!!config}
        stale={!!error}
        status={status}
        onSelect={(id) => {
          setSelected(id);
          setAffiliate("0");
          setChoice(0);
          setSourcePage(0);
          setMessage("");
          const url = new URL(window.location.href);
          if (id) url.searchParams.set("collection", String(id));
          else url.searchParams.delete("collection");
          url.searchParams.delete("affiliate");
          window.history.replaceState(null, "", url);
        }}
        vote={votePanel}
        mint={mintPanel}
        affiliates={affiliatePanel}
        awards={awardsPanel}
        refund={refundPanel}
        sponsored={sponsoredPanel}
        vault={vaultPanel}
        holders={state && <HolderRewardsPanel state={state} token={token} onToken={setToken} disabled={disabled} busy={busy} connected={!!wallet.session} explorer={explorer} onClaim={() => {
          if (!provider || !config || !state.holders || !r) return;
          const reward = state.holders.rewardPerNft;
          void submit("Claim holder reward", `Claim ${eth(reward)} for NFT #${token} in ${r.name} (${r.address}) from pool ${state.holders.address}. Recipient: ${wallet.session!.address}. Network: ${config.chainId === 1 ? "Ethereum Mainnet" : "Sepolia testnet"}. First come, first served in onchain execution order; a pending transaction does not reserve a slot. Network fees are separate.`, (fresh, address) => holderClaimTransaction(provider, config, fresh, integerInput(token), address, reward));
        }} />}
        protocolVersion={config?.version ?? (config ? 12 : 13)}
        explorer={explorer}
        controller={config?.controller}
      />
    );
  return (
    <div className="protocol-page">
      <header className="protocol-intro">
        <p className="protocol-eyebrow">Tincta · Onchain seasons</p>
        <h1>Season control.</h1>
        <p>
          Review pending signatures and follow every season onchain. Once a
          collection opens, its rules run without operator approval.
        </p>
      </header>
      {!config ? (
        <>
          <section className="protocol-panel">
            <h2>Onchain seasons are being prepared.</h2>
            <p>
              The new voting contracts are not connected to this website yet.
              Existing collections and claims keep their immutable contracts and
              holder rights.
            </p>
          </section>
          <OperatorWorkspace
            state={null}
            catalog={plannedCatalog}
            disabled
            operator={false}
            actions={[]}
            onAction={() => {}}
            onSelect={() => {}}
            onFundDraw={() => {}}
          />
        </>
      ) : (
        <>
          {status}
          {state && (
            <>
              <OperatorWorkspace
                state={state}
                catalog={catalog}
                disabled={disabled}
                stale={!!error}
                operator={operator}
                actions={operatorActions(state, config)}
                onSelect={setSelected}
                onAction={(action) => {
                  void submit(
                    action.title,
                    `${action.description} Destination: ${
                      action.request.to
                    }. Value: ${eth(
                      BigInt(action.request.value ?? 0)
                    )}. Network: ${
                      config.chainId === 1
                        ? "Ethereum Mainnet"
                        : "Sepolia testnet"
                    }.`,
                    async (fresh) => {
                      const current = operatorActions(fresh, config).find(
                        (a) => a.id === action.id
                      );
                      if (
                        !current ||
                        current.request.to !== action.request.to ||
                        current.request.data !== action.request.data ||
                        current.request.value !== action.request.value ||
                        fresh.count !== state.count
                      )
                        throw new Error(
                          "This action changed. Refresh and review its current amount."
                        );
                      if (
                        current.operatorOnly &&
                        wallet.session?.address.toLowerCase() !==
                          fresh.operator.toLowerCase()
                      )
                        throw new Error("Connect the fixed operator wallet.");
                      return current.request;
                    }
                  );
                }}
                onFundDraw={(amount) => {
                  try {
                    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount))
                      throw new Error(
                        "Enter an exact ETH amount with at most 18 decimal places."
                      );
                    const value = parseEther(amount);
                    if (value <= 0n)
                      throw new Error("Enter an amount greater than zero.");
                    void submit(
                      "Add draw funding",
                      `Send ${eth(
                        value
                      )} to the VRF subscription through collection ${
                        state.round!.name
                      } (${state.round!.address}) on ${
                        config.chainId === 1
                          ? "Ethereum Mainnet"
                          : "Sepolia testnet"
                      }. Network fees are separate.`,
                      async (fresh) => {
                        if (
                          !fresh.round ||
                          fresh.round.address !== state.round?.address ||
                          ![2, 3].includes(fresh.round.phase)
                        )
                          throw new Error(
                            "The draw state changed. Refresh before adding funds."
                          );
                        return new Contract(
                          fresh.round.address,
                          roundAbi
                        ).fundRandomness.populateTransaction({ value });
                      }
                    );
                  } catch (e) {
                    setMessage(walletError(e));
                  }
                }}
              />
              <p className="protocol-note">
                Read at block {state.block}.{" "}
                <a
                  href={explorer(config.controller)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Season controller ↗
                </a>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
