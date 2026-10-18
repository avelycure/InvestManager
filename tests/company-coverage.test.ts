import assert from 'node:assert/strict';
import test from 'node:test';
import { companyCoverage } from '../src/company-coverage.ts';
import type { ConfigFiles, NewsItem, SelectedNews } from '../src/types.ts';

const config: ConfigFiles = { companies: [{ name: 'Фосагро', ticker: 'PHOR' }], topics: [], channels: [], publications: [] };
const start = new Date('2026-10-16T06:00:00Z');
function item(title: string, day: number, id: number, official = false): NewsItem {
  return { title, text: title, url: `https://example.com/${id}`, source: official ? 'Фосагро · Пресс центр компании' : 'Издание',
    publishedAt: new Date(`2026-10-${String(day).padStart(2, '0')}T06:00:00Z`), ...(official ? { companySource: 'Фосагро' } : {}) };
}

void test('combines five official releases and three other stories for one company', () => {
  const current: SelectedNews[] = [{ ...item('Фосагро объявила результаты', 17, 1, true), category: 'company', company: 'Фосагро', reason: '' },
    { ...item('Фосагро меняет руководство', 17, 2), category: 'company', company: 'Фосагро', reason: '' }];
  const historical = [
    ...[9, 10, 11, 12, 13, 14].map((day) => item(`Фосагро: пресс-релиз ${day}`, day, day, true)),
    item('Фосагро объявила дивиденды', 10, 40),
    item('Фосагро запустила новый завод', 11, 41),
    item('Фосагро сообщила о росте продаж', 12, 42),
    item('Фосагро сменила аудитора', 13, 43),
    { ...item('Обзор рынка', 15, 99), text: 'В тексте вскользь упомянута Фосагро' },
  ];
  const [group] = companyCoverage(config, current, historical, start);
  assert.equal(group?.company, 'Фосагро');
  assert.deepEqual(group?.press.map((news) => news.publishedAt.getUTCDate()), [17, 14, 13, 12, 11]);
  assert.deepEqual(group?.news.map((news) => news.publishedAt.getUTCDate()), [17, 13, 12]);
});

void test('ignores archive month navigation', () => {
  const [group] = companyCoverage(config, [], [
    { ...item('10. 2026', 15, 20, true), url: 'https://example.com/#server-rendered-pressreleaselist-month-2026-10' },
    item('Фосагро опубликовала отчёт', 14, 21, true),
  ], start);
  assert.deepEqual(group?.press.map((news) => news.title), ['Фосагро опубликовала отчёт']);
});

void test('company fallback excludes publications older than six months', () => {
  const [group] = companyCoverage(config, [], [
    { ...item('Фосагро старый пресс-релиз', 14, 70, true), publishedAt: new Date('2026-04-16T05:59:59Z') },
    { ...item('Фосагро новый пресс-релиз', 14, 71, true), publishedAt: new Date('2026-04-17T06:00:00Z') },
  ], start);
  assert.deepEqual(group?.press.map((news) => news.title), ['Фосагро новый пресс-релиз']);
});
