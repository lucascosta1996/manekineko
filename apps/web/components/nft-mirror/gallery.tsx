import Link from 'next/link';
import { buttonClassName } from '@manekineko/ui/button-styles';
import { Icon } from '@manekineko/ui/icons';
import { GenesisArtwork } from '@manekineko/ui/genesis-artwork';
import { nftLinks } from '../../lib/nfts/links';
import { NFT_PAGE_SIZE, galleryPath, type CollectionDirectory, type CollectionGallery } from '../../lib/nft-mirror/model';

export function GalleryPagination({path,page,total}: {path: string; page: number; total: number}) {
  const pages = Math.max(1,Math.ceil(total/NFT_PAGE_SIZE));
  if (pages<2) return null;
  return <nav className="mirror-pagination" aria-label="Gallery pages">
    {page>1 ? <Link prefetch={false} href={`${path}?page=${page-1}`} className={buttonClassName({variant:'secondary'})}><Icon name="back" />Previous</Link> : <span />}
    <p>Page {page} of {pages}</p>
    {page<pages ? <Link prefetch={false} href={`${path}?page=${page+1}`} className={buttonClassName({variant:'secondary'})}>Next<Icon name="arrow" /></Link> : <span />}
  </nav>;
}
export function CollectionDirectoryView({data}: {data: CollectionDirectory}) {
  return <section className="mirror-page">
    <header className="mirror-heading"><p className="eyebrow">Tincta editions</p><h1>Every mint. Its own identity.</h1>
      <p>Explore Genesis and season collections, their minted NFTs and original onchain artwork.</p></header>
    {!!data.genesis?.length && <section className="mirror-genesis" aria-labelledby="genesis-collections-title">
      <div className="mirror-section-label"><h2 id="genesis-collections-title">Tincta Genesis</h2><p>The first vote.</p></div>
      <p className="mirror-genesis-intro">A free collectible for the first paid vote only. No financial reward entitlement.</p>
      <div className="mirror-grid">{data.genesis.map(item=><Link prefetch={false} className="mirror-collection" href={galleryPath(item.chainId,item.address)} key={`${item.chainId}:${item.address}`}>
        {item.cover ? <img src={item.cover} alt="Tincta Genesis minted onchain artwork" width={600} height={600} loading="lazy" decoding="async" /> : <GenesisArtwork />}
        <div className="mirror-card-body"><p className="mirror-caption">{item.chainId === 11155111 ? 'Sepolia testnet' : 'Ethereum'} · 0 ETH + network gas</p>
          <h3>View Genesis NFTs<Icon name="arrow" /></h3><p className="mirror-caption">{item.minted} / 1,000 minted{item.minted>item.ready || item.catchingUp ? ' · Artwork syncing' : ''}</p></div>
      </Link>)}</div>
      <div className="mirror-back-row"><Link className="ui-text-action" href="/">Open participation<Icon name="arrow" /></Link></div>
    </section>}
    {!data.collections.length ? <div className="mirror-message"><h2>{data.genesis?.length ? 'Season collections are on their way.' : 'Collections are on their way.'}</h2>
      <p>{data.configured ? 'The gallery is waiting for confirmed collection data. New mints appear after their artwork has synced.' : 'The collection gallery is being prepared. Check back soon.'}</p></div>
      : <><div className="mirror-section-label"><h2>{data.genesis?.length ? 'Season collections' : 'Collections'}</h2><p>{data.total} collections</p></div>
        <div className="mirror-grid">{data.collections.map(item=><Link prefetch={false} className="mirror-collection" href={galleryPath(item.chainId,item.address)} key={`${item.chainId}:${item.address}`}>
          {item.cover ? <img src={item.cover} alt={`${item.name} minted artwork`} width={640} height={800} loading="lazy" decoding="async" />
            : <div className="mirror-cover-empty"><Icon name="layers" /><span>Awaiting first artwork</span></div>}
          <div className="mirror-card-body"><p className="mirror-caption">{item.seasonName}</p><h3>{item.name}<Icon name="arrow" /></h3>
            <p className="mirror-caption">{item.ready} NFTs{item.minted>item.ready || item.catchingUp ? ' · Syncing' : ''}</p></div>
        </Link>)}</div><GalleryPagination path="/collections" page={data.page} total={data.total} /></>}
  </section>;
}
export function CollectionGalleryView({data}: {data: CollectionGallery}) {
  const {collection:item,tokens,page} = data;
  const genesis = item.kind === 'genesis';
  const pending = item.minted-item.ready;
  const syncing = pending>0 || item.catchingUp || !item.syncedAt;
  return <section className="mirror-page">
    <div className="mirror-back-row"><Link className="ui-text-action" href="/collections"><Icon name="back" />All collections</Link></div>
    <header className="mirror-heading"><p className="eyebrow">{item.seasonName}</p><h1>{item.name}</h1>
      <p>{genesis ? 'The first vote. A free collectible with its own permanent onchain artwork.' : 'Original onchain artwork. Four permanent numbers for every minted NFT.'}</p>
      {genesis && <p>Votes only on the first paid collection. No financial reward entitlement.</p>}</header>
    <div className="mirror-section-label"><h2>Minted NFTs</h2><p>{item.ready} available{pending>0 ? ` · ${pending} syncing` : ''}</p></div>
    <div className="mirror-sync"><p>{item.catchingUp || !item.syncedAt ? 'The gallery is catching up with confirmed mints.' : `Mirrored through block ${item.blockNumber?.toLocaleString('en-US')}.`}
      {' '}New mints appear after confirmation and artwork sync.</p>
      {item.syncedAt && <p>Last synced <time dateTime={item.syncedAt}>{new Date(item.syncedAt).toISOString().replace('T',' ').slice(0,16)} UTC</time>.</p>}</div>
    {tokens.length ? <div className={`mirror-grid${genesis ? ' mirror-genesis' : ''}`}>{tokens.map(nft=>{
      const links = nftLinks(item.chainId,item.address,String(nft.tokenId));
      return <article className="mirror-nft" key={nft.tokenId}>
        <a href={links.openSea ?? links.blockscout!} target="_blank" rel="noopener noreferrer" aria-label={`View ${nft.name} on ${links.openSea ? 'OpenSea' : 'Blockscout'}`}>
          <img src={nft.image} alt={genesis ? `${nft.name}. The first vote.` : `${nft.name}. Numbers ${nft.numbers.join(', ')}.`} width={genesis ? 600 : 640} height={genesis ? 600 : 800} loading="lazy" decoding="async" />
        </a>
        <div className="mirror-card-body"><div className="mirror-token-heading"><h3>NFT #{nft.tokenId}</h3>{nft.burned && <span className="mirror-caption">Refunded · Burned</span>}</div>
          {genesis ? <p className="mirror-caption">Genesis · First ballot only</p> : <ol className="mirror-numbers" aria-label={`NFT ${nft.tokenId} permanent numbers`}>{nft.numbers.map((number,index)=><li key={index}><span className="mirror-number-label">{'ABCD'[index]}</span><span>{number}</span></li>)}</ol>}
          <div className="mirror-links">{links.openSea && <a href={links.openSea} target="_blank" rel="noopener noreferrer">OpenSea<Icon name="external" /></a>}
            {links.blockscout && <a href={links.blockscout} target="_blank" rel="noopener noreferrer">Blockscout<Icon name="external" /></a>}</div>
        </div>
      </article>;
    })}</div> : <div className="mirror-message"><h3>{syncing ? 'Artwork is syncing.' : 'No confirmed mints here yet.'}</h3>
      <p>{pending>0 ? `The minted NFTs are recorded. Their original artwork${genesis ? '' : ' and numbers'} will appear as the mirror catches up.`
        : syncing ? 'The gallery is catching up. Confirmed NFTs will appear as their artwork and numbers finish syncing.'
        : 'Minted NFTs will appear here automatically once confirmed.'}</p></div>}
    <GalleryPagination path={galleryPath(item.chainId,item.address)} page={page} total={item.ready} />
    <p className="mirror-footnote">{genesis ? <>Ownership at the first paid ballot’s snapshot determines voting eligibility. <Link href="/docs/genesis">Read the Genesis rules<Icon name="arrow" /></Link></> : <>These numbers identify each NFT; they do not predict prizes. <Link href="/docs/verification">How permanent numbers work<Icon name="arrow" /></Link></>}</p>
  </section>;
}
