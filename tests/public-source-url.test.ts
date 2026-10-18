import assert from 'node:assert/strict';
import test from 'node:test';
import { publicSourceUrl } from '../src/public-source-url.ts';

void test('rejects local or private configured source addresses', () => {
  for (const address of ['http://localhost/feed', 'http://127.0.0.1/rss', 'http://10.1.2.3/rss',
    'http://192.168.1.1/rss', 'http://172.20.1.1/rss', 'http://[::1]/rss', 'http://169.254.1.1/rss',
    'http://user:pass@example.com/rss']) assert.equal(publicSourceUrl(address), undefined, address);
  assert.equal(publicSourceUrl('https://example.com/rss'), 'https://example.com/rss');
});
