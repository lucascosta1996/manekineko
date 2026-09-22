import { getAddress, isHexString, MaxUint256, ZeroAddress } from "ethers";

export const ETHEREUM_VRF = {
  "1": {
    coordinator: "0xD7f86b4b8Cae7D942340FF628F82735b7a20893a",
    keyHash: "0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9",
  },
  "11155111": {
    coordinator: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
    keyHash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
  },
} as const;

export function parseV2Config(input: unknown, chainId: bigint, timestamp: bigint) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("V2 config must be a JSON object.");
  if (![1n, 11155111n, 31337n].includes(chainId)) throw new Error("V2 supports Ethereum Mainnet, Sepolia and local chain 31337 only.");
  const raw = input as Record<string, unknown>;
  function text(field: string) {
    if (typeof raw[field] !== "string" || raw[field].length === 0) throw new Error(`${field} must be nonempty text.`);
    return raw[field];
  }
  function integer(field: string) {
    const value = text(field);
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${field} must be an unsigned canonical decimal string.`);
    return BigInt(value);
  }
  if (integer("chainId") !== chainId) throw new Error("Configured chainId does not match the connected Ethereum network.");
  const name = text("name");
  const symbol = text("symbol");
  const maxSupply = integer("maxSupply");
  const mintPrice = integer("mintPriceWei");
  const duration = integer("mintDurationSeconds");
  const initialOwner = getAddress(text("initialOwner"));
  const requestConfirmations = integer("requestConfirmations");
  const callbackGasLimit = integer("callbackGasLimit");
  const randomnessFundingWei = integer("randomnessFundingWei");
  if (Buffer.byteLength(name) > 80 || Buffer.byteLength(symbol) > 16 ||
      maxSupply < 1n || maxSupply > 65_536n || mintPrice < 2n || mintPrice % 2n !== 0n || mintPrice > MaxUint256 / maxSupply ||
      duration < (chainId === 31337n ? 60n : 3600n) || duration > 31_536_000n || timestamp < 0n || timestamp > MaxUint256 - duration ||
      initialOwner === ZeroAddress || requestConfirmations < 64n || requestConfirmations > 200n ||
      callbackGasLimit < 100_000n || callbackGasLimit > 2_500_000n || randomnessFundingWei < 1n || randomnessFundingWei > (1n << 96n) - 1n) {
    throw new Error("Invalid V2 terms, owner, funding or VRF gas/confirmation limits.");
  }
  let vrfCoordinator: string;
  let keyHash: string;
  if (chainId === 31337n) {
    vrfCoordinator = getAddress(text("vrfCoordinator"));
    keyHash = text("keyHash");
    if (vrfCoordinator === ZeroAddress || !isHexString(keyHash, 32) || BigInt(keyHash) === 0n) throw new Error("Local V2 config needs a mock coordinator and nonzero keyHash.");
  } else {
    const official = ETHEREUM_VRF[chainId.toString() as keyof typeof ETHEREUM_VRF];
    vrfCoordinator = official.coordinator;
    keyHash = official.keyHash;
    if ((raw.vrfCoordinator !== undefined && getAddress(text("vrfCoordinator")) !== vrfCoordinator) ||
        (raw.keyHash !== undefined && text("keyHash").toLowerCase() !== keyHash)) throw new Error("V2 coordinator and keyHash must match the reviewed Ethereum deployment.");
  }
  if (raw.activateSale !== undefined && typeof raw.activateSale !== "boolean") throw new Error("activateSale must be a boolean.");
  return {
    config: { name, symbol, maxSupply, mintPrice, mintDeadline: timestamp + duration, initialOwner, vrfCoordinator, keyHash, requestConfirmations, callbackGasLimit },
    randomnessFundingWei,
    activateSale: raw.activateSale === true,
  };
}
