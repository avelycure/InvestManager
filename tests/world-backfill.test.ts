import assert from 'node:assert/strict';
import test from 'node:test';
import { worldBackfill } from '../src/world-backfill.ts';
import { compactCoverageIssues } from '../src/coverage-issues.ts';
import type { ConfigFiles, NewsItem, SelectedNews } from '../src/types.ts';

const config = { companies: [], topics: [
  { name: 'Инфляция', keywords: ['цены'] }, { name: 'Нефть', keywords: ['нефть'] },
], publications: [], channels: [] } as unknown as ConfigFiles;
const start = new Date('2026-10-16T06:00:00Z');
function story(title: string, date: string, url: string): NewsItem {
  return { title, text: title, source: 'Издание', url, publishedAt: new Date(date) };
}

void test('older world stories fill only topics absent from the 24-hour report', () => {
  const current: SelectedNews[] = [{ ...story('Рост цен', '2026-10-17T05:00:00Z', 'https://example.com/new'),
    category: 'world', topic: 'Инфляция', reason: '' }];
  const groups = worldBackfill(config, current, [
    story('Нефть дорожает', '2026-10-15T08:00:00Z', 'https://example.com/oil-1'),
    story('Нефть дешевеет', '2026-10-14T08:00:00Z', 'https://example.com/oil-2'),
    story('Рост цен', '2026-10-15T07:00:00Z', 'https://example.com/prices'),
    story('Нефть сегодня', '2026-10-16T07:00:00Z', 'https://example.com/fresh'),
    { ...story('Публикация о погоде', '2026-10-15T09:00:00Z', 'https://example.com/weather'), text: 'Нефть упала' },
  ], start);
  assert.deepEqual(groups.map((group) => [group.topic, ...group.items.map((item) => item.title)]),
    [['Нефть', 'Нефть дорожает', 'Нефть дешевеет']]);
});

void test('older world stories allow ten items for every uncovered topic', () => {
  const historical = config.topics.flatMap((topic) => Array.from({ length: 11 }, (_, index) =>
    story(`${topic.keywords[0]} сообщение ${index}`, '2026-10-15T08:00:00Z',
      `https://example.com/${topic.name}/${index}`)));
  const groups = worldBackfill(config, [], historical, start);
  assert.deepEqual(groups.map((group) => [group.topic, group.items.length]),
    [['Инфляция', 10], ['Нефть', 10]]);
});

void test('older topic stories also prefer other editions before exceeding three from one', () => {
  const historical = [
    ...Array.from({ length: 6 }, (_, index) => ({ ...story(`Нефть сообщение ${index}`, '2026-10-15T08:00:00Z', `https://a.example/${index}`), source: 'ТАСС' })),
    { ...story('Нефть из другого издания', '2026-10-14T08:00:00Z', 'https://b.example/1'), source: 'РБК' },
  ];
  const groups = worldBackfill(config, [], historical, start);
  assert.deepEqual(groups.find((group) => group.topic === 'Нефть')?.items.map((item) => item.source),
    ['ТАСС', 'ТАСС', 'ТАСС', 'РБК', 'ТАСС', 'ТАСС', 'ТАСС']);
});

void test('topic fallback excludes publications older than six months', () => {
  const groups = worldBackfill(config, [], [
    story('Нефть слишком старая', '2026-04-17T05:59:59Z', 'https://example.com/old'),
    story('Нефть в пределах срока', '2026-04-17T06:00:00Z', 'https://example.com/recent'),
  ], start);
  assert.deepEqual(groups.find((group) => group.topic === 'Нефть')?.items.map((item) => item.title), ['Нефть в пределах срока']);
});

void test('feed depth and public Telegram notices are summarized, while failures remain', () => {
  const compact = compactCoverageIssues([
    { source: 'РБК', message: 'полный охват пока не подтверждён: 30 записей' },
    { source: 'ТАСС', message: 'полный охват пока не подтверждён: 100 записей' },
    { source: '@news', message: 'Публичная страница показывает не все посты за 24 часа' },
    { source: 'Сбер', message: 'Источник вернул HTTP 502' },
  ]);
  assert.equal(compact.length, 3);
  assert.match(compact[0]?.message ?? '', /HTTP 502/);
  assert.match(compact[1]?.message ?? '', /РБК, ТАСС/);
  assert.match(compact[2]?.message ?? '', /@news/);
});
