"use client";

/** Production components with isolated data. This module is never routed by apps/web. */
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

export function WebVisualFixture({ path = "/", state = "loaded" }: { path?: string; state?: string }) {
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
  const collection = state === "refundable" ? { ...visualCollection, phase: "refundable" as const, mintDeadline: "2026-09-27T00:00:00.000Z" } : state === "drawing" ? { ...visualCollection, totalMinted: 1000, totalMintRevenueWei: "10000000000000000000", phase: "awaiting_randomness" as const, randomnessState: "pending" as const, randomnessRequestId: "1" } : visualCollection;
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
