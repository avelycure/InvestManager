import assert from 'node:assert/strict';
import test from 'node:test';
import { isHtmlFeedResponse } from '../src/feed-response.ts';

void test('RSS and Atom bodies are parsed as feeds even when labeled HTML', () => {
  assert.equal(isHtmlFeedResponse('\uFEFF<?xml version="1.0"?><rss version="2.0"></rss>', { 'Content-Type': 'text/html' }), false);
  assert.equal(isHtmlFeedResponse('<feed xmlns="http://www.w3.org/2005/Atom"></feed>', { 'content-type': 'text/html' }), false);
});

void test('HTML challenge page is recognized even when labeled XML', () => {
  assert.equal(isHtmlFeedResponse('<!doctype html><html><body>blocked</body></html>', { 'Content-Type': 'application/xml' }), true);
});
