import "server-only";
import { chainEnabled } from "../chain-policy";
import { createReadRpc } from "../affiliates/rpc-read-transport";
import { createNftMetadataReader, type MetadataRecord } from "./metadata-reader";
import { NftMetadataUnavailable } from "./metadata";
import { trustedFactoryPin } from "../trusted-factories.ts";

const readers = new Map<string, { url: string; factory: string; hash: string; read: ReturnType<typeof createNftMetadataReader> }>();

export async function readNftMetadata(record: MetadataRecord) {
  try {
    if (![1, 11155111].includes(record.chainId) || !chainEnabled(record.chainId)) throw new NftMetadataUnavailable();
    if (record.contractVersion !== "affiliate-v5" && record.contractVersion !== "affiliate-v6" && record.contractVersion !== "affiliate-v7" && (record.contractVersion !== "affiliate-v8" && record.contractVersion !== "affiliate-v9" && record.contractVersion !== "affiliate-v10")) throw new NftMetadataUnavailable();
    const version = record.contractVersion === "affiliate-v10" ? "V10" : record.contractVersion === "affiliate-v9" ? "V9" : record.contractVersion === "affiliate-v8" ? "V8" : record.contractVersion === "affiliate-v7" ? "V7" : record.contractVersion === "affiliate-v6" ? "V6" : "V5";
    const key = `${record.chainId}:${version}:${record.factoryAddress.toLowerCase()}`;
    const url = process.env[`AFFILIATE_RPC_URL_${record.chainId}`];
    const pin = trustedFactoryPin(record.chainId,record.contractVersion,record.factoryAddress);
    const factory = pin?.factory, hash = pin?.factoryCodeHash;
    if (!url || new URL(url).protocol !== "https:" || !factory || !hash) throw new NftMetadataUnavailable();
    let reader = readers.get(key);
    if (!reader || reader.url !== url || reader.factory !== factory || reader.hash !== hash) {
      reader = { url, factory, hash, read: createNftMetadataReader(createReadRpc(url), { chainId: record.chainId, factoryAddress: factory, factoryCodeHash: hash, contractVersion: record.contractVersion }) };
      readers.set(key, reader);
    }
    return await reader.read(record);
  } catch { throw new NftMetadataUnavailable(); }
}
