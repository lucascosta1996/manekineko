import artwork from './genesis-artwork.json' with {type:'json'};

/** Exact Genesis #1 geometry, with the immutable deployment's supply caption. */
export function genesisArtworkForSupply(supply=1000n):string {
  if(supply===1000n)return artwork.image;
  if(supply!==20n)throw new Error('Unsupported Genesis artwork supply.');
  const prefix='data:image/svg+xml;base64,';
  return prefix+btoa(atob(artwork.image.slice(prefix.length)).replace('#1 / 1000','#1 / 20'));
}
