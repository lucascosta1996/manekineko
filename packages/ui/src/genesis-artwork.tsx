import artwork from "./genesis-artwork.json";

/** Exact tokenURI artwork from Genesis #1; contract tests enforce byte parity. */
export function GenesisArtwork({ className = "genesis-artwork" }: { className?: string }) {
  return <figure className={className}>
    <img src={artwork.image} width={600} height={600} style={{ display: "block", width: "100%", height: "auto" }} alt="Tincta Genesis: a single black circle at the origin of a fine geometric frame on white." />
    <figcaption>Onchain artwork · NFT #1 preview</figcaption>
  </figure>;
}
