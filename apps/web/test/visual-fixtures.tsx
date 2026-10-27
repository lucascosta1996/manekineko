"use client";

/** Production components with isolated data. This module is never routed by apps/web. */
import { CollectionDirectoryView, CollectionGalleryView } from "../components/nft-mirror/gallery";
import { mirrorFixtureCollection, mirrorFixtureGallery, genesisFixtureGallery } from "./nft-mirror-visual-data";
import MirrorLoading from "../app/collections/loading";
import MirrorError from "../app/collections/error";
import MirrorNotFound from "../app/collections/not-found";
import { keccak256 } from "ethers";
import { ProtocolExperience } from "../components/protocol/protocol-experience";
import { useState } from "react";
import { CollectionActivity } from "../components/collection-activity";
import { EnrollmentConfirmation } from "../components/affiliates/enrollment-confirmation";
import { SiteShell } from "../components/site-shell";
import { SeasonsExperience, SeasonExperience } from "../components/seasons-experience";
import { MintExperience } from "../components/mint-experience";
import { AffiliateExperience } from "../components/affiliates/affiliate-experience";
import { ContractExperience } from "../components/contract-experience";
import { HistoryExperience } from "../components/history/history-experience";
import { NftGallery } from "../components/nfts/nft-gallery";
import { NftDetail } from "../components/nfts/nft-detail";
import { PrizeHub } from "../components/prizes/prize-hub";
import { DocsArticle } from "../components/docs/docs-article";
import { DocsNavigation } from "../components/docs/docs-navigation";
import { docPages } from "../lib/docs/content";
import { docSearchEntry } from "../lib/docs/model";
import { calculateHistoryStats } from "../lib/history/model";
import Loading from "../app/loading";
import ErrorPage from "../app/error";
import NotFound from "../app/not-found";
import DocsLoading from "../app/docs/loading";
import DocsError from "../app/docs/error";
import DocsNotFound from "../app/docs/not-found";
import MintError from "../app/mint/error";
import MintNotFound from "../app/mint/not-found";
import SeasonsError from "../app/seasons/error";
import SeasonsNotFound from "../app/seasons/not-found";
import HistoryError from "../app/history/error";
import NftError from "../app/nfts/[collectionId]/[tokenId]/error";
import NftNotFound from "../app/nfts/[collectionId]/[tokenId]/not-found";
import { visualArchive, visualCollection, visualNft, visualNow, visualWallet } from "./visual-data";

export const webBoundaryRoutes = ["/visual/docs/loading", "/visual/docs/error", "/visual/docs/not-found", "/visual/mint/error", "/visual/mint/not-found", "/visual/seasons/error", "/visual/seasons/not-found", "/visual/history/error", "/visual/nft/error", "/visual/nft/not-found"];
export const webVisualRoutes = ["/", "/seasons", `/seasons/11155111/${visualCollection.seasonId}`, "/mint", `/mint/${visualCollection.id}`, `/mint/${visualCollection.id}/affiliates`, `/mint/${visualCollection.id}/contract`, "/history", "/my-nfts", `/nfts/${visualCollection.id}/1`, "/prizes", "/docs", ...docPages.filter(page => page.slug !== "overview").map(page => `/docs/${page.slug}`), "/visual/loading", "/visual/error", "/visual/not-found", ...webBoundaryRoutes];

function ReviewControlsFixture() {
  const [token,setToken]=useState("");
  const collection={...visualCollection,totalMinted:0,phase:"pending_activation" as const,saleStartAt:"2026-09-28T12:30:00.000Z"};
  return <SiteShell section="seasons" chainId={11155111}><main><h1>Enrollment review</h1><CollectionActivity collection={collection} showEnrollment initialNow={Date.parse(visualNow)} /><EnrollmentConfirmation siteKey="isolated-fixture" challengeId="11111111-1111-4111-8111-111111111111" onToken={setToken} onConfirm={()=>{}} busy={false} disabled={!token}/></main></SiteShell>;
}

export function WebVisualFixture({ path = "/", state = "loaded", page = 1 }: { path?: string; state?: string; page?: number }) {
  const [mirrorRecovered,setMirrorRecovered] = useState(false);
  if (path === "/collections" || path.startsWith("/collections/") || path.startsWith("/visual/collections/")) {
    const data = path.endsWith('0x'+'5'.repeat(40)) ? genesisFixtureGallery(page,state) : mirrorFixtureGallery(page,state);
    const retry = () => setMirrorRecovered(true);
    return <SiteShell section="nfts">{path === "/visual/collections/loading" ? <MirrorLoading /> : path === "/visual/collections/error" && !mirrorRecovered ? <MirrorError retry={retry} /> : path === "/visual/collections/not-found" ? <MirrorNotFound /> : path === "/collections" || mirrorRecovered
      ? <CollectionDirectoryView data={{genesis:state.startsWith("genesis") ? [genesisFixtureGallery(1,state).collection] : [],configured:state!=="unconfigured",page:1,total:state==="empty" || state==="unconfigured"?0:3,collections:state==="empty" || state==="unconfigured"?[]:[{...mirrorFixtureCollection,cover:data.tokens[0]?.image ?? null},{...mirrorFixtureCollection,address:'0x'+'3'.repeat(40),name:'Quiet rhythm',cover:null,minted:0,ready:0},{...mirrorFixtureCollection,address:'0x'+'4'.repeat(40),name:'Maroon echo',cover:data.tokens[2]?.image ?? null}]}} />
      : <CollectionGalleryView data={data} />}</SiteShell>;
  }
  if (["/", "/vote", "/claims", "/affiliates", "/holders", "/operations"].includes(path)) {
    const view = path === "/holders" ? "holders" : path === "/claims" ? "claims" : path === "/affiliates" ? "affiliates" : path === "/operations" ? "operations" : "home";
    return <SiteShell section={view} protocolEnabled={state !== "unconfigured"} chainId={11155111}><ProtocolExperience view={view} config={state === "unconfigured" ? null : state === "v16" ? {version:16,chainId:11155111,controller:"0x5FbDB2315678afecb367f032d93F642f64180aa3",codeHash:"0xf922fd995949d2368b98a0df53d5339b8515d27303f28d12760d616f8f57161f",rpcUrl:"https://v16.fixture.invalid"} : {chainId:11155111,controller:"0x1111111111111111111111111111111111111111",codeHash:keccak256("0x6000"),rpcUrl:"https://v12.fixture.invalid", ...(state === "v14" ? { version: 14 as const, holderRewardsCodeHash: keccak256("0x6000"), genesisCodeHash: keccak256("0x6000") } : path === "/holders" && state !== "v12" ? { version: 13 as const, holderRewardsCodeHash: keccak256("0x6000") } : {})}} /></SiteShell>;
  }
  if(path === "/visual/review-controls") return <ReviewControlsFixture/>;
  const retry = () => window.location.reload(); // Only the isolated harness imports this callback.
  if (path === "/visual/mint/error") return <MintError retry={retry} />;
  if (path === "/visual/mint/not-found") return <MintNotFound />;
  if (path === "/visual/seasons/error") return <SeasonsError retry={retry} />;
  if (path === "/visual/seasons/not-found") return <SeasonsNotFound />;
  if (path === "/visual/history/error") return <HistoryError retry={retry} />;
  if (path === "/visual/nft/error") return <NftError retry={retry} />;
  if (path === "/visual/nft/not-found") return <NftNotFound />;
  if (path.startsWith("/visual/docs/")) return <SiteShell section="docs" className="docs-shell"><div className="docs-layout"><DocsNavigation entries={docPages.map(docSearchEntry)} /><div className="docs-page">{path.endsWith("/loading") ? <DocsLoading /> : path.endsWith("/error") ? <DocsError retry={retry} /> : <DocsNotFound />}</div></div></SiteShell>;
  if (path === "/visual/loading") return <Loading />;
  if (path === "/visual/error") return <ErrorPage retry={() => window.location.reload()} />;
  if (path === "/visual/not-found") return <NotFound />;
  if (path.startsWith("/docs")) {
    const page = docPages.find(item => item.slug === (path.split("/")[2] || "overview")) ?? docPages[0];
    return <SiteShell section="docs" className="docs-shell"><div className="docs-layout"><DocsNavigation entries={docPages.map(docSearchEntry)} /><div className="docs-page"><DocsArticle page={page} /></div></div></SiteShell>;
  }
  if (path.endsWith("/contract")) return <ContractExperience collection={visualCollection} program={null} />;
  const collection = state === "v11" ? { ...visualCollection, contractVersion:"affiliate-v11" as const, affiliatePayoutCapBps:0 } : state === "refundable" ? { ...visualCollection, phase: "refundable" as const, mintDeadline: "2026-09-27T00:00:00.000Z" } : state === "drawing" ? { ...visualCollection, totalMinted: 1000, totalMintRevenueWei: "10000000000000000000", phase: "awaiting_randomness" as const, randomnessState: "pending" as const, randomnessRequestId: "1" } : visualCollection;
  const section = path === "/history" ? "history" : path === "/prizes" ? "prizes" : path.startsWith("/nfts") || path === "/my-nfts" ? "nfts" : "seasons";
  let content;
  if (path === "/my-nfts") content = <NftGallery initialWallet={state === "wallet" || state === "empty" || state === "error" ? visualWallet : null} />;
  else if (path.startsWith("/nfts/")) content = <NftDetail item={visualNft} />;
  else if (path === "/prizes") content = <PrizeHub />;
  else if (path === "/history") { const collections = state === "empty" ? [] : [visualArchive]; content = <HistoryExperience collections={collections} inProgress={[]} stats={calculateHistoryStats(collections)} />; }
  else if (path.endsWith("/affiliates")) content = <AffiliateExperience collection={collection} />;
  else if (path.startsWith("/mint/")) content = <MintExperience collection={collection} />;
  else if (path.startsWith("/seasons/")) content = <SeasonExperience initialCollections={[collection]} initialSchedules={[]} initialNow={Date.parse(visualNow)} chainId={11155111} seasonId={visualCollection.seasonId!} />;
  else content = <SeasonsExperience initialCollections={state === "empty" ? [] : [collection]} initialSchedules={[]} initialNow={Date.parse(visualNow)} />;
  return <SiteShell section={section} chainId={11155111}>{content}</SiteShell>;
}
