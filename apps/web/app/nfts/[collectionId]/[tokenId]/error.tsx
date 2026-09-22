"use client";

export default function NftError({ reset }: { reset: () => void }) {
  return <section className="nft-empty" role="alert"><h1>This ticket is temporarily unavailable.</h1><p>Its blockchain record could not be loaded. Please try again.</p><button type="button" className="nft-button" onClick={reset}>Try again</button></section>;
}
