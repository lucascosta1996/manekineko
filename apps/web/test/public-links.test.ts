import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicLinks } from '@manekineko/ui/links';

test('footer destinations preserve the configured environment and leave missing destinations unavailable', () => {
  const links = publicLinks({ website: 'https://preview.tincta.xyz', app: 'https://app-preview.tincta.xyz/mint' });
  assert.equal(links.docs, 'https://app-preview.tincta.xyz/docs');
  assert.equal(links.website, 'https://preview.tincta.xyz/');
  assert.equal(links.telegram, null);
  assert.equal(links.contact, null);
  assert.equal(publicLinks({ app: 'http://localhost:3100' }).docs, 'http://localhost:3100/docs');
});

test('footer destinations reject unsafe schemes, credentials and insecure remote URLs', () => {
  for (const app of ['javascript:alert(1)', '//example.com', 'https://user:password@example.com', 'http://example.com', '#']) {
    assert.equal(publicLinks({ app }).app, null);
  }
  assert.equal(publicLinks({ contact: 'mailto:help@example.com' }).contact, 'mailto:help@example.com');
});
