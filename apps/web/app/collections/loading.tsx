export default function Loading() {
  return <section className="mirror-page" aria-busy="true"><header className="mirror-heading"><p className="eyebrow">Tincta editions</p><h1>Collections</h1><p role="status">Loading the gallery…</p></header>
    <div className="mirror-grid" aria-hidden="true">{Array.from({length:8},(_,i)=><div className="mirror-skeleton" key={i} />)}</div></section>;
}
