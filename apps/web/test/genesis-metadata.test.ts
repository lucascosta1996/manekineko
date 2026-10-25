import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeGenesisMetadata} from '../../../packages/contracts/src/onchain-metadata.ts';
import artwork from '../../../packages/ui/src/genesis-artwork.json' with {type:'json'};
const encode=(value:unknown)=>'data:application/json;base64,'+Buffer.from(JSON.stringify(value)).toString('base64');
test('Genesis preserves its exact passive artwork and rejects false identities or active SVG',()=>{
  const decoded=decodeGenesisMetadata(encode(artwork),1);
  assert.equal(decoded.image,artwork.image);assert.deepEqual(decoded.attributes,[]);
  assert.throws(()=>decodeGenesisMetadata(encode(artwork),2));
  assert.throws(()=>decodeGenesisMetadata(encode({...artwork,attributes:[{trait_type:'Prize',value:1}]}),1));
  const svg=Buffer.from(artwork.image.split(',')[1],'base64').toString();
  for(const bad of [svg.replace('<circle ','<circle onclick="alert(1)" '),svg.replace('</svg>','<script>alert(1)</script></svg>'),svg.replace('<circle ','<image href="https://example.com/" ')]) {
    assert.throws(()=>decodeGenesisMetadata(encode({...artwork,image:'data:image/svg+xml;base64,'+Buffer.from(bad).toString('base64')}),1));
  }
});
