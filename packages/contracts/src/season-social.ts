/** Shared, side-effect-free V9/V10 social content. Never infer chain facts here:
 * the runner supplies confirmed snapshots; the Launch console marks previews. */
export const SEASON_SOCIAL_EVENTS = ["upcoming-season", "affiliate-opening-soon", "affiliate-enrollment-open", "collection-live", "collection-sold-out", "winners-revealed", "refunds-available", "season-complete"] as const;
export type SeasonSocialEvent = typeof SEASON_SOCIAL_EVENTS[number];
export type SeasonSocialIdentity = { id: string; number: number; name: string; colors: string[] };
export type SeasonSocialCollection = { id: string; number: number; name: string; color: string; supply: number; mintPriceEth: string; winnerCount: number; prizePerWinnerEth: string };
export type SocialWinner = { rank: number; tokenId: string; awardEth: string; holderWallet: string; holderBlock: string; nftUrl: string; claimed: boolean };
export type SocialPayment = { rank: number; tokenId: string; awardEth: string; claimantWallet: string; recipientWallet: string; transactionHash: string; logIndex: number };
export type SeasonSocialInput = {
  /** Omitted only for historical V9 callers. */
  contractVersion?: "affiliate-v9" | "affiliate-v10";
  event: SeasonSocialEvent;
  chainId: 1 | 11155111;
  season: SeasonSocialIdentity;
  collection?: SeasonSocialCollection;
  /** UTC ISO timestamps; now is the verified snapshot/publication time. */
  now: string;
  enrollmentOpensAt?: string;
  saleStartsAt?: string;
  deadline?: string;
  urls: { season?: string; collection?: string; affiliate?: string; docs?: string; refund?: string; commissions?: string; prizeClaim?: string };
  /** Source is confirmed claim events, never allocations or promised prizes. */
  stats?: { collectionsSoldOut: number; nftsMinted: number; prizesClaimedEth: string; affiliateClaimedEth: string; snapshotBlock: string };
  winners?: SocialWinner[];
  payments?: SocialPayment[];
  /** A delayed worker must not claim the draw is still pending after reveal. */
  drawVerified?: boolean;
};
export type SeasonSocialMessage = {
  event: SeasonSocialEvent; chainId: 1 | 11155111; season: SeasonSocialIdentity; collection?: SeasonSocialCollection;
  generatedAt: string; validUntil: string | null;
  post: string; replies: string[]; replyKeys: string[];
  header: string; headline: string[]; detail?: string; footer: string; alt: string;
  metrics: { value: string; label: string }[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const count = (n: number) => n.toLocaleString("en-US");
function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f\uFFFE\uFFFF{}]/u.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function integer(value: number, label: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${label}`);
  return value;
}
function decimal(value: string, label: string) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function decimalInteger(value: string, label: string) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function wallet(value: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid wallet address");
  return value;
}
export function socialPublicUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) throw new Error("A public HTTPS URL is required");
  // Keep the shortened-URL counting contract unambiguous. Encode complex path
  // punctuation/Unicode instead of guessing where X's URL parser will stop.
  if (!/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_~.%/-]*)?(?:\?[A-Za-z0-9_~.%=&+/-]*)?(?:#[A-Za-z0-9_~.%=&+/?-]*)?$/.test(value) || /%(?![A-Fa-f0-9]{2})/.test(value) || /[.,:;!?&=#]$/.test(value)) throw new Error("Use an encoded public HTTPS URL without trailing punctuation");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("A public HTTPS URL is required"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".") || /(^|\.)(localhost|local|invalid|test|example|example\.com|example\.org|example\.net)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) throw new Error("A public HTTPS URL is required; preview and private URLs cannot be published");
  return value;
}
export function socialTimestamp(value: string | undefined): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) throw new Error("A UTC timestamp is required");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.replace(/(?<!\.\d{3})Z$/, ".000Z")) throw new Error("Invalid UTC timestamp");
  return date;
}
export function socialDateText(value: string | undefined): string {
  const date = socialTimestamp(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}
function countdown(now: string, future: string | undefined): string {
  const minutes = Math.ceil((socialTimestamp(future).getTime() - socialTimestamp(now).getTime()) / 60_000);
  if (minutes <= 0) throw new Error("Do not publish a stale opening countdown");
  return minutes % 60 === 0 ? `${minutes / 60}h` : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Conservative subset of X's published weighted counting rules. NFC; official
 * single-weight ranges; all other code points weigh 2. Complex emoji are NOT
 * collapsed, so this can reject valid text but never undercounts those emoji.
 * Only standalone, validated HTTPS tokens get the 23-character URL allowance.
 * Generated copy deliberately places every URL on its own line. */
export function socialTextWeight(value: string): number {
  return value.normalize("NFC").split(/(\s+)/u).reduce((total, token) => {
    if (/^https:\/\//.test(token)) { socialPublicUrl(token); return total + 23; }
    return total + [...token].reduce((sum, c) => {
      const n = c.codePointAt(0)!;
      return sum + (n <= 0x10ff || (n >= 0x2000 && n <= 0x200d) || (n >= 0x2010 && n <= 0x201f) || (n >= 0x2032 && n <= 0x2037) ? 1 : 2);
    }, 0);
  }, 0);
}
export function assertSocialText(value: string): string {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u0009\u000b-\u001f\u007f\uFFFE\uFFFF{}]/u.test(value)) throw new Error("Invalid X post text");
  if (socialTextWeight(value) > 280) throw new Error("X post exceeds the conservative 280-character weighted limit");
  return value.normalize("NFC");
}

export function buildSeasonSocialMessage(input: SeasonSocialInput): SeasonSocialMessage {
  if (input.contractVersion !== undefined && !["affiliate-v9", "affiliate-v10"].includes(input.contractVersion)) throw new Error("Unsupported social contract version");
  if (!SEASON_SOCIAL_EVENTS.includes(input.event)) throw new Error("Unknown social event");
  if (input.chainId !== 1 && input.chainId !== 11155111) throw new Error("Unsupported social network");
  socialTimestamp(input.now);
  const season = input.season;
  if (!/^0x[0-9a-fA-F]{64}$/.test(season.id) || /^0x0{64}$/.test(season.id)) throw new Error("A stable season identity is required");
  integer(season.number, "season number", 1); text(season.name, "season name", 100);
  if (!Array.isArray(season.colors) || season.colors.length < 1 || season.colors.length > 32 || season.colors.some(color => !/^#[0-9a-fA-F]{6}$/.test(color))) throw new Error("Invalid ordered season colors");
  const c = input.collection;
  const isSeason = input.event === "upcoming-season" || input.event === "season-complete";
  if (!isSeason && !c) throw new Error("Collection terms are required for this event");
  if (c) {
    text(c.id, "collection ID"); text(c.name, "collection name", 100); integer(c.number, "collection number", 1);
    if (c.number > season.colors.length || c.color !== season.colors[c.number - 1]) throw new Error("Collection must retain its ordered season color");
    integer(c.supply, "supply", 1); integer(c.winnerCount, "winner count", 1);
    if (c.winnerCount > Math.min(10, c.supply)) throw new Error("Invalid winner count");
    decimal(c.mintPriceEth, "mint price"); decimal(c.prizePerWinnerEth, "prize amount");
  }
  const network = input.chainId === 11155111 ? "Sepolia" : "Ethereum Mainnet";
  const prefix = input.chainId === 11155111 ? "[Sepolia test]\n" : "";
  const serial = pad(season.number);
  const title = `Season ${serial}${c ? ` · ${c.name}` : ""}`;
  const url = (key: keyof SeasonSocialInput["urls"]) => socialPublicUrl(input.urls[key]);
  let post = "", header = "", headline: string[] = [], detail: string | undefined, footer = "";
  const replies: string[] = [], replyKeys: string[] = [], metrics: SeasonSocialMessage["metrics"] = [];
  const reply = (key: string, value: string) => { replyKeys.push(key); replies.push(value); };
  switch (input.event) {
    case "upcoming-season":
      header = "UPCOMING SEASON";
      headline = season.name.includes(" & ") ? [season.name.split(" & ")[0] + " &", season.name.split(" & ").slice(1).join(" & ")] : [season.name];
      footer = "Color, collected.";
      post = `Coming next: Season ${serial}.\n${season.name}.\n\n${season.colors.length} colors. ${input.chainId === 11155111 ? "One new color study." : "One new season of Tincta."}\n\nColor, collected.`;
      reply("season", `Season details:\n${url("season")}`);
      break;
    case "affiliate-opening-soon": {
      const remaining = countdown(input.now, input.enrollmentOpensAt);
      header = "AFFILIATE ENROLLMENT"; headline = ["Enrollment", `opens in ${remaining}.`];
      detail = socialDateText(input.enrollmentOpensAt).replace(", ", " · ").toUpperCase();
      footer = "Get ready. Affiliate guide in the thread.";
      post = `${title}\n\nAffiliate enrollment opens in ${remaining}.\n${socialDateText(input.enrollmentOpensAt)}\n\nCheck eligibility and get ready. Guide in the thread.`;
      reply("guide", `Read the eligibility, qualification and commission terms before joining:\n${url("docs")}`);
      break;
    }
    case "affiliate-enrollment-open": {
      const remaining = countdown(input.now, input.saleStartsAt);
      if (socialTimestamp(input.enrollmentOpensAt).getTime() > socialTimestamp(input.now).getTime()) throw new Error("Enrollment has not opened");
      header = "AFFILIATE ENROLLMENT"; headline = ["Enrollment", "is open."];
      detail = `MINT SCHEDULED · ${socialDateText(input.saleStartsAt).replace(", ", " · ").toUpperCase()}`;
      footer = "Join the affiliate program through the thread.";
      post = `${title}\n\nAffiliate enrollment is open.\nMinting is scheduled in ${remaining}: ${socialDateText(input.saleStartsAt)}.\n\nJoin through the link in the thread.`;
      reply("enroll", `Check eligibility and enroll:\n${url("affiliate")}`);
      reply("timing", `Enrollment closes at ${socialDateText(input.saleStartsAt)}, or earlier if all positions fill. Minting cannot begin before its scheduled opening and requires activation.`);
      break;
    }
    case "collection-live":
      if (socialTimestamp(input.saleStartsAt).getTime() > socialTimestamp(input.now).getTime() || socialTimestamp(input.deadline).getTime() <= socialTimestamp(input.now).getTime()) throw new Error("Mint is outside its immutable sale window");
      header = "MINT IS LIVE"; headline = ["Minting", "is live."];
      detail = `${count(c!.supply)} NFTs · ${c!.mintPriceEth} ETH · ${c!.winnerCount} × ${c!.prizePerWinnerEth} ETH PRIZES`;
      footer = `Deadline: ${socialDateText(input.deadline)}.`;
      post = `${title} is live.\n\n${count(c!.supply)} NFTs · ${c!.mintPriceEth} ETH each.\n${c!.winnerCount} prizes of ${c!.prizePerWinnerEth} ETH after sellout and the verified draw.\n\nDeadline: ${socialDateText(input.deadline)}.\nMint link in the thread.`;
      reply("mint", `Mint and read the collection terms:\n${url("collection")}`);
      if (input.contractVersion === "affiliate-v10") reply("numbers", "Your NFT has permanent numbers and artwork from mint, generated in Solidity. One VRF draw after sellout assigns scores and prizes separately. Numbers do not predict a win.");
      reply("claims", "Winning NFT holders claim prizes after the verified draw. Qualified affiliates claim commissions after sellout. If the deadline expires unsold, NFT holders can claim mint-price refunds.");
      break;
    case "collection-sold-out":
      header = "COLLECTION SOLD OUT"; headline = ["Sold out.", input.drawVerified ? "Draw verified." : "Draw next."];
      detail = `${count(c!.supply)} / ${count(c!.supply)} NFTs MINTED`;
      footer = "Affiliate commission claims in the thread.";
      post = `${title} is sold out.\n${count(c!.supply)} / ${count(c!.supply)} NFTs minted.\n\n${input.drawVerified ? "The draw is verified." : "The verified draw is next."} Qualified affiliates can claim their commissions.\n\nClaim link in the thread.`;
      reply("commissions", `Qualified affiliates: check your earned balance and claim:\n${url("commissions")}`);
      reply("results", `${input.drawVerified ? "View the verified draw." : "Winning NFTs are announced after the draw is verified."} Prize claims are separate from sellout.\n${url("collection")}`);
      break;
    case "winners-revealed": {
      if (input.drawVerified !== true || !input.winners || input.winners.length !== c!.winnerCount) throw new Error("Every verified winner is required");
      const seenRanks = new Set<number>(), seenTokens = new Set<string>();
      header = "VERIFIED DRAW"; headline = ["Winners", "revealed."];
      detail = `${c!.winnerCount} WINNING NFTs · ${c!.prizePerWinnerEth} ETH EACH`;
      footer = "Results and prize claims in the thread.";
      post = `${title}\n\nThe draw is verified: ${c!.winnerCount} winning NFTs, ${c!.prizePerWinnerEth} ETH each.\n${input.winners.every(winner => winner.claimed) ? "All prizes have been claimed." : "Winning NFT holders can claim unpaid prizes."}\n\nResults and claim link in the thread.`;
      reply("results", `View the verified results and prize claim status:\n${url("prizeClaim")}`);
      for (const winner of [...input.winners].sort((a, b) => a.rank - b.rank)) {
        integer(winner.rank, "award rank", 1); decimalInteger(winner.tokenId, "token ID"); decimalInteger(winner.holderBlock, "holder block");
        if (winner.rank > c!.winnerCount || seenRanks.has(winner.rank) || seenTokens.has(winner.tokenId) || typeof winner.claimed !== "boolean" || decimal(winner.awardEth, "award") !== c!.prizePerWinnerEth) throw new Error("Inconsistent winning award");
        seenRanks.add(winner.rank); seenTokens.add(winner.tokenId);
        reply(`winner:${winner.rank}`, `Award #${winner.rank} · NFT #${winner.tokenId} · ${winner.awardEth} ETH\nHolder at block ${winner.holderBlock}: ${wallet(winner.holderWallet)}\n\nVerified NFT:\n${socialPublicUrl(winner.nftUrl)}`);
      }
      for (const payment of input.payments ?? []) {
        integer(payment.rank, "award rank", 1); integer(payment.logIndex, "claim log index"); decimalInteger(payment.tokenId, "token ID");
        if (!/^0x[0-9a-fA-F]{64}$/.test(payment.transactionHash) || decimal(payment.awardEth, "award") !== c!.prizePerWinnerEth || !input.winners.some(winner => winner.rank === payment.rank && winner.tokenId === payment.tokenId && winner.claimed)) throw new Error("Inconsistent confirmed prize payment");
        const receipt = `https://${input.chainId === 11155111 ? "sepolia." : ""}etherscan.io/tx/${payment.transactionHash}`;
        reply(`payment:${payment.transactionHash.toLowerCase()}:${payment.logIndex}`, `Prize claimed · Award #${payment.rank} · NFT #${payment.tokenId}\n${payment.awardEth} ETH\nClaimant: ${wallet(payment.claimantWallet)}\nRecipient: ${wallet(payment.recipientWallet)}\n\nConfirmed receipt:\n${receipt}`);
      }
      break;
    }
    case "refunds-available":
      if (socialTimestamp(input.deadline).getTime() > socialTimestamp(input.now).getTime()) throw new Error("Refund deadline has not expired");
      header = "REFUNDS AVAILABLE"; headline = ["Refunds", "are open."];
      detail = "DEADLINE EXPIRED · COLLECTION UNSOLD"; footer = "Claim your mint-price refund through the thread.";
      post = `${title} did not sell out before its deadline.\n\nNFT holders can now claim a refund of ${c!.mintPriceEth} ETH per NFT.\n\nRefund link and details in the thread.`;
      reply("refund", `Current NFT holders can claim their mint-price refund here:\n${url("refund")}`);
      reply("terms", "Refunds require a claim from the current NFT holder. Each refunded NFT is burned. Network gas is not refunded. This unsold collection distributes no prizes or affiliate commissions.");
      break;
    case "season-complete": {
      const stats = input.stats;
      if (!stats) throw new Error("Confirmed season statistics are required");
      integer(stats.collectionsSoldOut, "collections sold out"); integer(stats.nftsMinted, "NFTs minted"); decimalInteger(stats.snapshotBlock, "snapshot block");
      if (stats.collectionsSoldOut > season.colors.length) throw new Error("Invalid sold-out collection count");
      decimal(stats.prizesClaimedEth, "prizes claimed"); decimal(stats.affiliateClaimedEth, "commissions claimed");
      header = "SEASON COMPLETE"; headline = [`Season ${serial}`, "complete."];
      footer = "Color, collected. Thank you for being part of it.";
      metrics.push({ value: `${stats.collectionsSoldOut} / ${season.colors.length}`, label: "COLLECTIONS SOLD OUT" }, { value: count(stats.nftsMinted), label: "NFTs MINTED" }, { value: `${stats.prizesClaimedEth} ETH`, label: "PRIZES CLAIMED" }, { value: `${stats.affiliateClaimedEth} ETH`, label: "COMMISSIONS CLAIMED" });
      post = `Season ${serial} is complete.\n${season.name}.\n\n${stats.collectionsSoldOut}/${season.colors.length} collections sold out · ${count(stats.nftsMinted)} NFTs minted.\n${stats.prizesClaimedEth} ETH in prizes claimed.\n${stats.affiliateClaimedEth} ETH in affiliate commissions claimed.\n\nColor, collected. Thank you.`;
      reply("season", `Season results and collection history:\n${url("season")}`);
      reply("snapshot", `Totals as of ${socialDateText(input.now)} · ${network}, block ${stats.snapshotBlock}. Claimed amounts reflect confirmed transfers. Outstanding claims remain subject to each collection's terms.`);
      break;
    }
  }
  if (new Set(replyKeys).size !== replyKeys.length) throw new Error("Duplicate social reply identity");
  const alt = `${input.chainId === 11155111 ? "Color study" : "Tincta"}. ${network}. Season ${serial}: ${season.name}.${isSeason ? "" : ` Collection ${pad(c!.number)}: ${c!.name}.`} ${headline.join(" ")}${detail ? ` ${detail}.` : ""}${metrics.length ? ` ${metrics.map(metric => `${metric.label}: ${metric.value}`).join("; ")}.` : ""} ${season.colors.length} palette bands and the season's geometric linework.`;
  if ([...alt].length > 1000) throw new Error("Image alt text is too long");
  const cutoff = input.event === "affiliate-opening-soon" ? input.enrollmentOpensAt : input.event === "affiliate-enrollment-open" ? input.saleStartsAt : input.event === "collection-live" ? input.deadline : undefined;
  const countdownEvent = input.event === "affiliate-opening-soon" || input.event === "affiliate-enrollment-open";
  const validUntil = cutoff ? new Date(Math.min(socialTimestamp(cutoff).getTime(), countdownEvent ? socialTimestamp(input.now).getTime() + 60_000 : Number.POSITIVE_INFINITY)).toISOString() : null;
  return { event: input.event, chainId: input.chainId, generatedAt: socialTimestamp(input.now).toISOString(), validUntil, season: { ...season, colors: [...season.colors] }, ...(c ? { collection: { ...c } } : {}), post: assertSocialText(prefix + post), replies: replies.map(assertSocialText), replyKeys, header, headline, detail, footer, alt, metrics };
}
