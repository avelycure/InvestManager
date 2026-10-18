import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudBaseUrl } from '../src/llm-endpoint.ts';

void test('accepts a provider-specific HTTPS base path', () => {
  assert.equal(cloudBaseUrl(' https://models.example.com/api/v1/ '), 'https://models.example.com/api/v1');
});

void test('rejects insecure or credential-bearing cloud API addresses', () => {
  for (const address of ['http://models.example.com/v1', 'https://user:secret@models.example.com/v1', 'https://models.example.com/v1?key=secret']) {
    assert.throws(() => cloudBaseUrl(address));
  }
});
