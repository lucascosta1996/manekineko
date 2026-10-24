import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StudioHeader, StudioFooter } from "../../components/studio-shell";
import { WhitepaperPrint } from "../../components/whitepaper-print";
import "../studio.css";
import "./whitepaper.css";

const title = "TAS-1: Tincta Autonomous Standard";
const description = "A proposed technical standard for autonomous, fully onchain systems: immutable rules, permissionless execution, complete onchain data, and verifiable participant rights.";

export const metadata: Metadata = {
  title: `${title} — Whitepaper`,
  description,
  alternates: { canonical: "https://tincta.xyz/whitepaper" },
  openGraph: { title, description, type: "article", url: "https://tincta.xyz/whitepaper", publishedTime: "2026-10-25" },
  twitter: { card: "summary", title, description },
};

const sections = [
  ["abstract", "Abstract"],
  ["scope", "What autonomy means"],
  ["architecture", "The system boundary"],
  ["rules", "Immutable rules"],
  ["lifecycle", "State & lifecycle"],
  ["execution", "Permissionless execution"],
  ["data", "Onchain data & identity"],
  ["assets", "Assets & invariants"],
  ["dependencies", "Entropy & dependencies"],
  ["interface", "A discoverable interface"],
  ["verification", "Proving conformance"],
  ["evolution", "Evolution of the standard"],
  ["references", "References"],
] as const;

function Section({ index, children }: { index: number; children: ReactNode }) {
  const [id, heading] = sections[index];
  return <section className="paper-section" id={id} aria-labelledby={`${id}-title`}>
    <div className="paper-section-heading"><span aria-hidden="true">{String(index).padStart(2, "0")}</span><h2 id={`${id}-title`}>{heading}</h2></div>
    <div className="paper-prose">{children}</div>
  </section>;
}

function Rule({ id, children }: { id: string; children: ReactNode }) {
  return <p className="paper-rule"><strong>{id}</strong> {children}</p>;
}

const interfaceDraft = `// Proposed discovery surface — draft 0.1.0.
// An interface declaration, not a reference implementation.
pragma solidity ^0.8.24;

interface ITAS1 {
    function specification() external pure
        returns (bytes32);

    function manifestURI() external view
        returns (string memory);
}`;

export default function WhitepaperPage() {
  return (
    <div className="studio whitepaper" id="top">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="studio-wrap">
        <StudioHeader whitepaper />
        <main id="main">
          <header className="paper-hero">
            <div>
              <p className="studio-eyebrow">Tincta research / Whitepaper 01</p>
              <h1>Tincta Autonomous Standard</h1>
              <p className="paper-deck">A specification for systems whose rules, state, and continuity belong onchain.</p>
            </div>
            <dl className="paper-metadata">
              <div><dt>Identifier</dt><dd>TAS-1</dd></div>
              <div><dt>Revision</dt><dd>0.1.0 · Draft proposal</dd></div>
              <div><dt>Published</dt><dd><time dateTime="2026-10-25">25 October 2026</time></dd></div>
              <div><dt>Scope</dt><dd>EVM smart contract systems</dd></div>
            </dl>
          </header>
          <div className="paper-status">
            <p>TAS-1 is a standard proposed by Tincta. It has no assigned ERC or EIP number. This paper defines a target architecture, not a certification of an existing deployment.</p>
            <div className="paper-print"><WhitepaperPrint /></div>
          </div>
          <div className="paper-layout">
            <aside className="paper-sidebar">
              <nav aria-label="Whitepaper contents">
                <p className="paper-contents-label">In this paper</p>
                <ol>{sections.map(([id, heading], index) => <li key={id}><a href={`#${id}`}><span aria-hidden="true">{String(index).padStart(2, "0")}</span>{heading}</a></li>)}</ol>
              </nav>
            </aside>
            <article className="paper-article" aria-label="TAS-1 specification">
              <Section index={0}>
                <p>A contract can live on a blockchain while its application still depends on a company to approve actions, supply essential data, run a private scheduler, or keep an image server online. Deployment alone does not establish autonomy.</p>
                <p>TAS-1 proposes a common technical vocabulary and a set of testable requirements for systems that remain usable without their original publisher. Rules are fixed before participation. Authoritative state and essential content remain onchain. Every required lifecycle transition is available through a public transaction path, and participant rights can be exercised without an operator’s permission.</p>
                <p>The standard applies to systems such as generative collections, collective publishing, and bounded coordination protocols. It does not prescribe a token, reward split, voting model, or business model. ERC-721 standardizes an NFT interface; TAS-1 addresses the architecture and continuing operation of a whole system. The two can be composed. <a href="#ref-721">[1]</a></p>
                <blockquote><p>If the publisher disappears, can participants still inspect the rules, advance the system, and exercise every right the contract promises?</p></blockquote>
              </Section>

              <Section index={1}>
                <p><strong>Autonomy is the absence of indispensable privileged discretion.</strong> It does not mean the absence of people, transactions, infrastructure, or cost. Ethereum contracts execute in response to transactions and calls; a deadline does not wake a contract. Someone must submit an eligible transaction and pay gas. <a href="#ref-execution">[2]</a></p>
                <dl className="paper-definitions">
                  <div><dt>Immutable rules</dt><dd>No privileged party can replace the governing logic or rewrite rights already established under it.</dd></div>
                  <div><dt>Onchain completeness</dt><dd>The chain contains the state and data needed to validate actions and reconstruct the system’s essential outputs.</dd></div>
                  <div><dt>Permissionless progress</dt><dd>Any caller can perform required maintenance once its onchain conditions are met. Participant actions still require the appropriate ownership, balance, or authorization.</dd></div>
                  <div><dt>Recoverable failure</dt><dd>Unmet prerequisites lead to a predetermined safe outcome, rather than an indefinite wait for an administrator.</dd></div>
                </dl>
                <p>Here, <strong>100% onchain</strong> describes the system’s authoritative rules, state, essential content, and enforcement. It does not describe the website or promise uninterrupted chain availability. The base chain’s consensus, censorship resistance, execution limits, and data availability remain assumptions.</p>
                <p>In this proposal, <strong>MUST</strong> is a conformance requirement, <strong>SHOULD</strong> is a recommendation whose exceptions need justification, and <strong>MAY</strong> is optional. A claim must identify this exact revision and the deployed system it covers.</p>
              </Section>

              <Section index={2}>
                <Rule id="TAS-01">A conformance claim MUST cover the complete authority-bearing contract graph, including factories, registries, renderers, libraries, vaults, and dependency indirection.</Rule>
                <p>An immutable entry point is insufficient if it delegates to replaceable code, reads an editable registry, or trusts an administrator-controlled verifier. The boundary follows authority and dependencies, not branding or repository folders.</p>
                <figure className="paper-boundary" aria-labelledby="boundary-caption">
                  <div className="paper-boundary-outside"><strong>Replaceable access layer</strong><p>Websites · indexers · RPC providers · transaction submitters</p></div>
                  <div className="paper-boundary-core">
                    <p className="paper-figure-label">Authoritative onchain system</p>
                    <ol>
                      <li><strong>Rules</strong><span>Fixed bytecode, parameters, and dependency graph</span></li>
                      <li><strong>State</strong><span>Rights, transitions, ownership, and liabilities</span></li>
                      <li><strong>Outputs</strong><span>Settlement, complete metadata, and rendering</span></li>
                    </ol>
                  </div>
                  <figcaption id="boundary-caption">Figure 1. Interfaces observe the chain and submit transactions. They do not decide whether an action is valid.</figcaption>
                </figure>
                <p>Every dependency MUST disclose its address or deterministic derivation, chain, code identity, role, and any control plane. An address plus a runtime code hash alone does not establish immutability: proxy storage, initialization, delegate calls, and transitive authority also require inspection.</p>
              </Section>

              <Section index={3}>
                <Rule id="TAS-02">The governing graph MUST be initialized and irreversibly sealed before accepting participation or custody under a TAS-1 claim.</Rule>
                <p>Sealing removes upgrade, arbitrary execution, discretionary pause, mutable renderer, and privileged rule-replacement paths. A timelock merely delays an upgrade; a multisig distributes authority. Neither makes that authority disappear. Renouncing one owner role is insufficient if another path can change the rules.</p>
                <p>Immutable rules can still govern changing state. Participants MAY vote, transfer rights, or select parameters inside a domain fixed by the code. The option set, eligibility rule, snapshot, quorum, tie handling, default outcome, deadline, and effect of the result MUST be specified onchain. Before funds become committed to an instance, its applicable economic terms MUST be frozen.</p>
                <p>Future instances MAY have different terms within that fixed domain. New software versions require new deployments and explicit opt-in. Migration cannot silently replace the logic securing existing positions or carry away their assets.</p>
              </Section>

              <Section index={4}>
                <Rule id="TAS-03">Every reachable nonterminal state MUST define its valid actions, guards, deadlines, and a finite path to completion or a safe exit under the declared chain and caller assumptions.</Rule>
                <p>Model execution as <code>S′ = δ(S, action, chain context)</code>. The same state, input, and chain context must produce the same result. Invalid actions revert without changing state. Events describe transitions; contract state determines whether an action is currently valid.</p>
                <figure className="paper-flow" aria-labelledby="flow-caption">
                  <ol>
                    <li><strong>Configure</strong><span>Validate and seal</span></li>
                    <li><strong>Participate</strong><span>Apply fixed admission rules</span></li>
                    <li><strong>Resolve</strong><span>Check the committed conditions</span></li>
                    <li><strong>Settle or exit</strong><span>Enforce the specified outcome</span></li>
                  </ol>
                  <figcaption id="flow-caption">Figure 2. An illustrative lifecycle. Each implementation defines its own states, including every timeout and failure edge.</figcaption>
                </figure>
                <p>Boundary semantics MUST be exact: for example, admission is valid while <code>block.timestamp &lt; closeAt</code>, and closing is valid at or after <code>closeAt</code>. A browser clock cannot establish either condition. Timestamp use must tolerate the timing and ordering properties of the selected chain.</p>
                <p>Progress functions MUST tolerate competing callers. A stale call either does nothing safely or reverts; it cannot pay twice, duplicate a transition, or overwrite a completed result. Iterative work needs bounded batches, a durable cursor, a finite work set, and a measurable decrease in remaining work. Required settlement must not loop over an unbounded participant list.</p>
              </Section>

              <Section index={5}>
                <Rule id="TAS-04">Required progress MUST NOT depend on a publisher-only key, private scheduler, discretionary signature, or exclusive relayer.</Rule>
                <p>Automation is a convenience layer. A keeper observes state and submits the same call that anyone else can submit. If it stops, another account can continue. User-authorized actions remain available directly or through a nonexclusive submission path; arbitrary callers do not gain the right to spend another user’s assets.</p>
                <p>Permission to call is only one part of liveness. Implementations MUST state who can pay for progress, the maximum work per call, and what happens when operating reserves are exhausted. They SHOULD provide a bounded execution incentive where progress benefits users who may no longer be online. No incentive can guarantee execution at every future gas price.</p>
                <p>Fees or bounties MUST be funded separately from protected liabilities, paid only for verified progress, and bounded against replay, fragmentation, and self-dealing. If continued operation becomes uneconomic, the precommitted safe-exit path must remain available without fresh publisher funding.</p>
                <p>The liveness claim is conditional: the chain continues, valid transactions can be included, and at least one willing caller can fund the required calls. Autonomy removes the publisher’s veto; it cannot remove these conditions.</p>
              </Section>

              <Section index={6}>
                <Rule id="TAS-05">Essential data and outputs MUST be reconstructible from persistent onchain state or code, without a required external server, gateway, secret, or unpublished file.</Rule>
                <p>For an NFT, ownership alone is insufficient. A fully onchain implementation returns complete metadata and media, or a complete deterministic recipe whose renderer and inputs are also onchain. An image URL, IPFS reference, or content hash is a reference or integrity commitment, not the underlying bytes. A hash cannot restore unavailable content.</p>
                <p>SVG or other generated output MUST have no essential remote fonts, scripts, images, or mutable base URI. Compressed bytes are acceptable if the decoding rules and all inputs remain available. Immutable shared data contracts are acceptable when they are inside the verified dependency graph.</p>
                <p>Critical execution data MUST be directly readable by contracts. Events can support indexing and historical inspection, but are not a substitute for state needed by a later transition. A Merkle root alone is also insufficient when users cannot reconstruct their own proofs from available data. Temporary blob availability does not satisfy permanent content storage.</p>
                <p>Permanent identity and evolving status SHOULD be distinct. A token may keep fixed identifying traits while separate state records current rights or lifecycle results. If its appearance evolves, the permitted evolution, renderer, and inputs must already be governed by the sealed rules.</p>
              </Section>

              <Section index={7}>
                <Rule id="TAS-06">Every asset-moving transition MUST preserve solvency, authorization, and single-use claims in the asset’s native integer units.</Rule>
                <div className="paper-equation" aria-label="Reserve invariant">
                  <code>available balance ≥ protected liabilities</code>
                  <p>For each supported asset, at every reachable state and after every successful external call.</p>
                </div>
                <p>Liabilities include all obligations that can coexist under the current state: refunds, vested claims, escrow, and committed operating reserves. Mutually exclusive settlement branches require a documented accounting model; the implementation must reserve enough for every still-reachable branch. Unsolicited transfers cannot be mistaken for participation or create claim rights.</p>
                <p>Use exact integer arithmetic. Specify the rounding direction, residual dust destination, zero-participant behavior, and bounds on every multiplication and division. A treasury entitlement can be fixed in the rules, but its withdrawal cannot consume participant reserves.</p>
                <p>Claims SHOULD use individual pull payments. Update the entitlement before transferring control, apply reentrancy protection where needed, and ensure one recipient’s failure cannot block others. If a transfer fails, the claim remains recoverable. If ownership conveys a claim, define precisely when ownership is checked and how transfers affect entitlement.</p>
                <p>Asset assumptions are part of conformance. A pausable, upgradeable, rebasing, or fee-charging token can invalidate an otherwise sound accounting model. Strict conformance cannot hide this authority outside the boundary. Immutable contracts are still vulnerable to implementation bugs; ordinary security review remains necessary. <a href="#ref-security">[3]</a></p>
              </Section>

              <Section index={8}>
                <Rule id="TAS-07">Every external input MUST disclose both its integrity assumptions and its availability assumptions. Verifying an input onchain does not make its production onchain.</Rule>
                <p>Strict TAS-1 conformance excludes indispensable offchain data authorities. A system using an oracle or externally produced randomness must identify that extension and cannot make an unqualified 100% onchain claim for the complete system. Even a correctly verified proof does not guarantee delivery. <a href="#ref-oracles">[4]</a></p>
                <p>For a randomness extension, commit the participant set and request context before accepting entropy. Bind fulfillment to the correct chain, instance, and request. Accept one valid result; prohibit discretionary rerolls and selective cancellation after the outcome is known. A block timestamp, caller seed, or block value must not be described as unbiased randomness merely because it is onchain.</p>
                <p>A failure policy MUST be fixed before participation. Specify the exact cutoff, the transaction that makes failure effective, how late responses are rejected, and which obligations survive. A timeout refund can introduce selective-abort incentives for a party able to withhold an unfavorable result. The threat model must acknowledge that tradeoff; a timeout alone does not solve fairness.</p>
                <p>Likewise, an L2 deployment must disclose sequencer, upgrade, bridge, and data-availability assumptions. Cross-chain claims require an explicit trust and recovery model. A system’s strongest claim cannot exceed that of its weakest indispensable dependency.</p>
              </Section>

              <Section index={9}>
                <Rule id="TAS-08">A conforming root MUST expose the exact specification revision and an onchain manifest describing the system under assessment.</Rule>
                <p>This draft proposes a deliberately small discovery surface. It complements application interfaces rather than replacing their mint, vote, transfer, or settlement functions. ERC-165 provides the interface-detection mechanism. <a href="#ref-165">[5]</a></p>
                <pre className="paper-code" tabIndex={0} aria-label="Proposed Solidity discovery interface"><code>{interfaceDraft}</code></pre>
                <p>For this revision, <code>specification()</code> returns <code>keccak256(bytes("TAS-1:0.1.0"))</code>. The root also implements ERC-165 and reports support for <code>type(ITAS1).interfaceId</code>. These are proposed conventions, not an assigned ERC identifier or proof of correct behavior.</p>
                <p><code>manifestURI()</code> returns a self-contained <code>data:application/json;base64,</code> document. Its bytes MUST be immutable once the system is sealed. Runtime status belongs in separate getters. The manifest records:</p>
                <ul>
                  <li>The specification revision, chain ID, root address, and deployment identity.</li>
                  <li>The complete dependency graph, code identities, initialization constraints, and sealing conditions.</li>
                  <li>State and action definitions, ABI signatures, guards, deadline semantics, and bounded progress paths.</li>
                  <li>Asset assumptions, accounting invariants, rights, data reconstruction rules, and all declared extensions.</li>
                </ul>
                <p>Self-reported data can lie. A verifier must independently compare the manifest with bytecode, storage, and actual behavior. To avoid a circular commitment, a contract need not embed a hash of itself or of the manifest containing that hash; deployment-specific runtime hashes belong in the external verification record.</p>
                <p>The canonical manifest schema and executable conformance suite remain draft work. This interface is a reviewable starting point, not a finalized interoperability promise.</p>
              </Section>

              <Section index={10}>
                <Rule id="TAS-09">Conformance MUST be supported by a reproducible, deployment-specific evidence record. Interface support or source verification alone is insufficient.</Rule>
                <p>Record the chain ID, root and dependency addresses, deployment transactions, finalized observation block and hash, runtime code hashes, compiler and optimizer settings, linked libraries, constructor inputs, and sealed storage state. Reproduce the build and verify the entire graph, including factory-created children and contracts not visible in the primary ABI.</p>
                <div className="paper-checks">
                  <div><h3>Authority removal</h3><p>Enumerate every privileged role, proxy slot, delegate-call target, registry setter, initializer, and emergency function. Prove that none can rewrite established rights or block required progress indefinitely.</p></div>
                  <div><h3>State-machine properties</h3><p>Fuzz action order, deadline boundaries, duplicate calls, stale inputs, maximal participant counts, and malicious recipients. Check solvency, no double claims, monotonic progress, and immutable terms after every transition.</p></div>
                  <div><h3>Publisher disappearance</h3><p>Disable the UI, database, official indexer, and keeper. From an unrelated funded account, reconstruct the next valid action, advance each lifecycle branch, and complete claims or exits using public contract calls.</p></div>
                  <div><h3>Adversarial dependencies</h3><p>Exercise withheld and late oracle responses, failed transfers, exhausted operating reserves, transaction reordering, and interrupted batches. State the behavior under chain reorganizations and the confirmation policy used by clients.</p></div>
                </div>
                <p>Gas measurements MUST cover maximum supported bounds on the target chain. A finite algorithm can still be unusable if one required call exceeds the block gas limit. Source review, property testing, independent security assessment, and live deployment verification provide different evidence and must be reported separately.</p>
                <p>No conformance statement should imply mathematical proof unless the relevant properties, model, assumptions, and proof artifacts are provided. Immutable bugs cannot be patched in place; review before sealing matters more, not less.</p>
              </Section>

              <Section index={11}>
                <p>TAS-1 is proposed as a public technical standard, independent of any single Tincta application. This paper does not declare Tincta Rewards—or any deployed contract—conformant, and it does not modify existing contracts.</p>
                <p>The next work is to stabilize the manifest schema, publish a minimal reference implementation, build adversarial conformance tests, and invite independent technical review. No completion date or external standards acceptance is implied. A future ERC submission would follow the Ethereum standards process and receive its own identifier through that process. <a href="#ref-eip">[6]</a></p>
                <p>Revisions must preserve their published history. Breaking semantics require a new specification revision and fresh deployment assessment; they cannot retroactively change the rules of systems already deployed. Compatibility means a precisely stated contract, not an automatically inherited label.</p>
                <p>The objective is practical: make “autonomous” and “fully onchain” claims specific enough that an independent person can test them.</p>
              </Section>

              <Section index={12}>
                <p>The requirements and TAS-1 identifier are proposed here by Tincta. These primary sources define the underlying interfaces, execution model, and security considerations.</p>
                <ol className="paper-references">
                  <li id="ref-721"><a href="https://eips.ethereum.org/EIPS/eip-721">ERC-721: Non-Fungible Token Standard</a><span>Token ownership, transfers, and the optional metadata interface.</span></li>
                  <li id="ref-execution"><a href="https://ethereum.org/developers/docs/smart-contracts/anatomy/">Ethereum: Anatomy of smart contracts</a><span>Execution, functions, and transaction-triggered state changes.</span></li>
                  <li id="ref-security"><a href="https://docs.soliditylang.org/en/latest/security-considerations.html">Solidity: Security considerations</a><span>Reentrancy, gas limits, randomness, and defensive design.</span></li>
                  <li id="ref-oracles"><a href="https://ethereum.org/developers/docs/oracles/">Ethereum: Oracles</a><span>External data, verification, and oracle trust assumptions.</span></li>
                  <li id="ref-165"><a href="https://eips.ethereum.org/EIPS/eip-165">ERC-165: Standard Interface Detection</a><span>Discovering supported interfaces through function selectors.</span></li>
                  <li id="ref-eip"><a href="https://eips.ethereum.org/EIPS/eip-1">EIP-1: EIP Purpose and Guidelines</a><span>The proposal lifecycle and Ethereum standards process.</span></li>
                </ol>
              </Section>
            </article>
          </div>
        </main>
        <StudioFooter />
      </div>
    </div>
  );
}
