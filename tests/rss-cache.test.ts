import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachedWindow, EMPTY_RSS_CACHE, recordFeeds } from '../src/rss-cache.ts';

const publications = [{ name: 'ТАСС', url: 'https://example.test/tass.xml' }];
const start = new Date('2026-10-17T06:00:00Z');
const end = new Date('2026-10-18T06:00:00Z');

function observation(fetchedAt: string, oldestPublishedAt: string) {
  return [{ source: 'ТАСС', url: publications[0]!.url, fetchedAt, oldestPublishedAt,
    entryCount: 100, undatedCount: 0, hasNextPage: false }];
}

function article(time: string, id: number) {
  return { title: `Новость ${id}`, text: 'Текст', url: `https://example.test/${id}`,
    source: 'ТАСС', feedUrl: publications[0]!.url, publishedAt: new Date(time) };
}

void test('feeds with the same edition name retain their own URL in cache', () => {
  const two = [publications[0]!, { name: 'ТАСС', url: 'https://example.test/second.xml' }];
  const state = recordFeeds(EMPTY_RSS_CACHE, two, [], [
    article('2026-10-17T07:00:00Z', 1),
    { ...article('2026-10-17T08:00:00Z', 2), feedUrl: two[1]!.url },
  ], end);
  assert.deepEqual(state.articles.map((entry) => entry.feedUrl), [two[1]!.url, two[0]!.url]);
});

void test('overlapping polls retain all articles and confirm a full window', () => {
  let state = recordFeeds(EMPTY_RSS_CACHE, publications,
    observation('2026-10-17T07:00:00Z', '2026-10-17T05:00:00Z'),
    [article('2026-10-17T06:30:00Z', 1)], new Date('2026-10-17T07:00:00Z'));
  state = recordFeeds(state, publications,
    observation('2026-10-18T06:00:00Z', '2026-10-17T06:30:00Z'),
    [article('2026-10-18T05:00:00Z', 2)], end);
  const result = cachedWindow(state, publications, start, end);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.issues, []);
});

void test('a feed that rotated while the computer slept reports a gap', () => {
  let state = recordFeeds(EMPTY_RSS_CACHE, publications,
    observation('2026-10-17T07:00:00Z', '2026-10-17T05:00:00Z'), [],
    new Date('2026-10-17T07:00:00Z'));
  state = recordFeeds(state, publications,
    observation('2026-10-18T06:00:00Z', '2026-10-18T03:00:00Z'), [], end);
  const result = cachedWindow(state, publications, start, end);
  assert.match(result.issues[0]?.message ?? '', /полный охват пока не подтверждён/);
  assert.doesNotMatch(result.issues[0]?.message ?? '', /без даты/);
});

void test('only articles in the requested window from configured feeds are returned', () => {
  const state = recordFeeds(EMPTY_RSS_CACHE, publications,
    observation('2026-10-18T06:00:00Z', '2026-10-17T05:00:00Z'),
    [article('2026-10-17T05:59:59Z', 1), article('2026-10-17T06:00:00Z', 2),
      article('2026-10-18T06:00:00Z', 3), article('2026-10-18T06:00:01Z', 4)], end);
  assert.deepEqual(cachedWindow(state, publications, start, end).items.map((item) => item.title),
    ['Новость 3', 'Новость 2']);
});

void test('a stale successful fetch does not claim complete coverage after a later failure', () => {
  const state = recordFeeds(EMPTY_RSS_CACHE, publications,
    observation('2026-10-17T07:00:00Z', '2026-10-17T05:00:00Z'), [],
    new Date('2026-10-17T07:00:00Z'));
  assert.match(cachedWindow(state, publications, start, end).issues[0]?.message ?? '',
    /после последней проверки ленты/);
});
