function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 23V7l10 7L26 7v16a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M11 21h2m6 0h2m-6 3h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function getCollectionUrl() {
  const configured = process.env.NEXT_PUBLIC_WEB_URL;
  if (!configured) return process.env.NODE_ENV === "development" ? "http://localhost:3100" : null;
  try {
    const url = new URL(configured);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function LandingPage() {
  const collectionUrl = getCollectionUrl();

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <a className="brand" href="/" aria-label="Tincta home"><BrandMark /><span>tincta<span className="brand-dot">.</span></span></a>
        <nav aria-label="Main navigation"><a href="#idea">The idea</a><a href="#on-chain">Permanent artwork</a></nav>
        {collectionUrl ? <a className="app-link" href={collectionUrl}>Collection app <span aria-hidden="true">↗</span></a> : <span className="preview-label"><span aria-hidden="true" />In development</span>}
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true" /> A COLLECTION OF POSSIBILITIES</p>
            <h1 id="hero-title">Good fortune.<br />Written <em>on-chain.</em></h1>
            <p className="hero-description">A permanent four-number identity from the moment you mint. After sellout, one verifiable draw assigns the scores and selects the winning NFTs.</p>
            <a className="primary-link" href="#idea">Explore the idea <span aria-hidden="true">↓</span></a>
            <p className="launch-note">Introducing V10. Rollout is pending. Published collections keep their original rules.</p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-circle circle-one" /><div className="visual-circle circle-two" />
            <div className="brand-card">
              <div className="card-header"><span>TINCTA</span><span>V10</span></div>
              <div className="large-mark"><BrandMark /></div>
              <div className="card-footer"><span>A LITTLE LUCK.<br />A LASTING COLLECTIBLE.</span><span>↗</span></div>
            </div>
            <span className="visual-caption">Every combination begins a possibility.</span>
          </div>
        </section>

        <section className="idea-section" id="idea" aria-labelledby="idea-title">
          <div className="section-intro"><p className="eyebrow">A SIMPLE IDEA</p><h2 id="idea-title">Collect a combination.<br />Follow the possibilities.</h2></div>
          <div className="idea-grid">
            <article><span className="article-number">01 / COLLECT</span><h3>Limited by design.</h3><p>Every collection has a fixed mint price and supply limit, configured in its own contract.</p></article>
            <article><span className="article-number">02 / DISCOVER</span><h3>Your numbers, from mint.</h3><p>Solidity generates four numbers from 1 to 16 for every NFT. Each ordered combination is unique within its collection and stays fixed. Buyers supply no numbers or seed. These identities are publicly predictable; they do not reveal the later score.</p></article>
            <article><span className="article-number">03 / FOLLOW</span><h3>One draw. Distinct winners.</h3><p>After sellout, one Chainlink VRF result lets the contract finalize scores and select distinct winning NFTs. The default is six equal prizes, claimed by the winning NFT holders. A collection fixes 1–10 winners before minting; one wallet can hold several.</p></article>
          </div>
        </section>

        <section className="on-chain-section" id="on-chain" aria-labelledby="on-chain-title">
          <div><p className="eyebrow">THE COLLECTION BELONGS ON-CHAIN</p><h2 id="on-chain-title">From the first number<br />to the last pixel.</h2></div>
          <div className="on-chain-copy"><p>The NFT&apos;s SVG artwork, metadata and permanent numbers come from the contract. They are complete at mint and stay unchanged after the draw. Final scores, winning status and claims are read separately from contract state, rather than embedded in the collectible.</p><p>No image server or metadata service is needed to construct the NFT. Chainlink VRF still supplies the draw&apos;s verifiable randomness through external oracle infrastructure. Explorers control when they first index and display the artwork; the V10 design removes the need to refresh it after sellout.</p><div className="chain-tags"><span>Permanent on-chain SVG</span><span>Numbers at mint</span><span>One post-sellout draw</span></div></div>
        </section>
      </main>

      <footer><a className="brand footer-brand" href="/" aria-label="Tincta home"><BrandMark /><span>tincta.</span></a><p>Permanent numbers. Verifiable results.</p><span>V10 preview · Deployment pending</span></footer>
    </div>
  );
}
