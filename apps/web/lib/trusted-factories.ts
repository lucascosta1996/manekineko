import { getAddress, ZeroAddress } from "ethers";

export type TrustedFactory = { chainId: number; contractVersion: string; factory: string; factoryCodeHash: string };
type Environment = Record<string, string | undefined>;
const versions = [3, 4, 5, 6, 7, 8, 9, 10];
function checked(pin: TrustedFactory): TrustedFactory {
  if (![1, 11155111].includes(pin.chainId) || !/^affiliate-v(?:[3-9]|10)$/.test(pin.contractVersion)
    || getAddress(pin.factory) === ZeroAddress || !/^0x[0-9a-f]{64}$/i.test(pin.factoryCodeHash)
    || /^0x0{64}$/i.test(pin.factoryCodeHash)) throw new Error("invalid_trusted_factory_configuration");
  return {...pin,factory:getAddress(pin.factory).toLowerCase(),factoryCodeHash:pin.factoryCodeHash.toLowerCase()};
}

/** Explicit per-address pins extend existing version pins; no registry or database discovery grants trust. */
export function trustedFactoryPins(env: Environment = process.env): TrustedFactory[] {
  const result: TrustedFactory[] = [];
  for (const chainId of [1,11155111]) for (const version of versions) {
    const suffix = `${version === 3 ? "" : `V${version}_`}${chainId}`;
    const factory = env[`AFFILIATE_TRUSTED_FACTORY_${suffix}`], factoryCodeHash = env[`AFFILIATE_TRUSTED_FACTORY_CODEHASH_${suffix}`];
    if (factory && factoryCodeHash) result.push(checked({chainId,contractVersion:`affiliate-v${version}`,factory,factoryCodeHash}));
  }
  if (env.AFFILIATE_ADDITIONAL_TRUSTED_FACTORIES_JSON) {
    let extra: unknown;
    try {extra=JSON.parse(env.AFFILIATE_ADDITIONAL_TRUSTED_FACTORIES_JSON);} catch {throw new Error("invalid_trusted_factory_configuration");}
    if (!Array.isArray(extra) || extra.length > 8) throw new Error("invalid_trusted_factory_configuration");
    for (const value of extra) {
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 4
        || Object.keys(value).some(key=>!["chainId","contractVersion","factory","factoryCodeHash"].includes(key))) throw new Error("invalid_trusted_factory_configuration");
      result.push(checked(value));
    }
  }
  const seen = new Set<string>();
  for (const pin of result) {
    const key=`${pin.chainId}:${pin.contractVersion}:${pin.factory}`;
    if (seen.has(key)) throw new Error("duplicate_trusted_factory_configuration");
    seen.add(key);
  }
  return result;
}
export function trustedFactoryPin(chainId: number, contractVersion: string, factory: string, env: Environment = process.env) {
  return trustedFactoryPins(env).find(pin=>pin.chainId===chainId&&pin.contractVersion===contractVersion&&pin.factory===factory.toLowerCase());
}
