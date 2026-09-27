export const DEFAULT_MINT_DURATION_SECONDS = "86400";
/** Applies at editable-plan boundaries, never when reading frozen historical artifacts. */
export function assertEditableMintDuration(contract: {chainId: string;mintDurationSeconds:string;sepoliaRehearsal?:string;algorithmVersion?:string;maxSupply?:string}) {
  if (!/^(0|[1-9]\d*)$/.test(contract.mintDurationSeconds)) throw new Error("Mint duration must be whole seconds.");
  const duration=BigInt(contract.mintDurationSeconds);
  if(contract.sepoliaRehearsal!==undefined) {
    if(contract.chainId!=="11155111"||contract.sepoliaRehearsal!=="refund-3-30m"||contract.algorithmVersion!=="unique-rank-v6"||duration!==1800n||!/^\d+$/.test(contract.maxSupply??"")||BigInt(contract.maxSupply!)<=3n)throw new Error("The refund rehearsal requires Sepolia V10, 3 tickets, supply above 3 and exactly 1800 seconds.");
  } else if(duration<3600n||duration>86400n)throw new Error("New mint windows must be between 1 and 24 hours (maximum 86400 seconds).");
}
