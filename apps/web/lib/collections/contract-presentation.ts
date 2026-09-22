import type { CollectionPublic } from "./model.ts";

export type SourceVersion = "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10";

/** The deployed collection, never an affiliate preview, selects its source. */
export function contractSourceVersion(collection: Pick<CollectionPublic, "contractVersion" | "algorithmVersion">): SourceVersion {
  switch (collection.contractVersion) {
    case "affiliate-v10": return "V10";
    case "affiliate-v9": return "V9";
    case "affiliate-v8": return "V8";
    case "affiliate-v7": return "V7";
    case "affiliate-v6": return "V6";
    case "affiliate-v5": return "V5";
    case "affiliate-v4": return "V4";
    case "affiliate-v3": return "V3";
    case "legacy": return collection.algorithmVersion === "feistel-v1" ? "V1" : "V2";
    default: throw new Error("Unsupported contract source version.");
  }
}

export function etherscanContractUrl(collection: Pick<CollectionPublic, "chainId" | "contractStatus" | "contractAddress">): string | null {
  const { chainId, contractStatus, contractAddress } = collection;
  if (contractStatus !== "deployed" || !contractAddress || !/^0x[0-9a-f]{40}$/i.test(contractAddress) || /^0x0{40}$/i.test(contractAddress)) return null;
  const origin = chainId === 1 ? "https://etherscan.io" : chainId === 11155111 ? "https://sepolia.etherscan.io" : null;
  return origin ? `${origin}/address/${contractAddress}#code` : null;
}
