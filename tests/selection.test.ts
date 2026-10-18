import assert from 'node:assert/strict';
import test from 'node:test';
import { diverseNews, selectNews, worldNewsPerTopic } from '../src/selection.ts';
import type { ConfigFiles, NewsItem, SelectedNews } from '../src/types.ts';

const config: ConfigFiles = {
  companies: [{ name: 'Газпром', ticker: 'GAZP' }],
  topics: [{ name: 'Нефть', keywords: ['нефть'] }],
  channels: [], publications: [],
};
const when = new Date('2026-10-17T06:00:00Z');
function item(title: string, url: string, source: string): NewsItem {
  return { title, text: title, url, source, publishedAt: when };
}

void test('matches whole company and topic terms without false substrings', () => {
  const selected = selectNews([
    item('Газпром объявил дивиденды', 'https://a.example/1', 'A'),
    item('нефтяная компания', 'https://a.example/2', 'A'),
    item('Цена нефть выросла', 'https://a.example/3', 'A'),
  ], config);
  assert.equal(selected.companies.length, 1);
  assert.equal(selected.world.length, 1);
});

void test('merges near-identical headlines and retains independent source', () => {
  const selected = selectNews([
    item('Газпром объявил новый размер дивидендов за год', 'https://a.example/1', 'A'),
    item('Газпром объявил новый размер дивидендов за год сегодня', 'https://b.example/2', 'B'),
  ], config);
  assert.equal(selected.companies.length, 1);
  assert.equal(selected.companies[0]?.relatedSources?.[0]?.source, 'B');
  assert.equal(selected.matchedCount, 2);
});

void test('merges the same story despite Russian word endings and different headlines', () => {
  const warConfig = { ...config, topics: [{ name: 'Война в Украине', keywords: ['Starlink'] }] };
  const selected = selectNews([
    item('The Telegraph: ограничить работу Starlink на Украине Трампу предложил Илон Маск', 'https://a.example/1', 'Коммерсантъ'),
    item('The Telegraph: Маск попросил Трампа замедлить работу Starlink на Украине', 'https://b.example/2', 'Ведомости'),
  ], warConfig);
  assert.equal(selected.world.length, 1);
  assert.equal(selected.world[0]?.relatedSources?.[0]?.source, 'Ведомости');
});

void test('keeps distinct stories with shared context separate', () => {
  const warConfig = { ...config, topics: [{ name: 'Война в Украине', keywords: ['Украине'] }] };
  const selected = selectNews([
    item('Трамп обсудил поставки оружия Украине с Зеленским', 'https://a.example/1', 'A'),
    item('Трамп обсудил мирные переговоры по Украине с Зеленским', 'https://b.example/2', 'B'),
  ], warConfig);
  assert.equal(selected.world.length, 2);
});

void test('does not attribute a Telegram roundup to a company mentioned after its lead story', () => {
  const roundup: NewsItem = {
    ...item('Что обсуждается: Яндекс (YDEX) восстановил сервисы', 'https://t.me/headlines_for_traders/86897', 'Канал'),
    text: 'Яндекс восстановил сервисы. ЕвроТранс получил иск. Фосагро опубликовала отчёт.',
    channel: true,
  };
  const direct: NewsItem = {
    ...item('Газпром опубликовал отчёт', 'https://t.me/channel/2', 'Канал'),
    channel: true,
  };
  const selected = selectNews([roundup, direct], config);
  assert.deepEqual(selected.companies.map((news) => news.title), ['Газпром опубликовал отчёт']);
  assert.equal(selected.matchedCount, 1);
});

void test('RSS description mentioning a portfolio company does not misattribute another headline', () => {
  const roundup = { ...item('Яндекс восстановил сервисы', 'https://news.example/yandex', 'Издание'),
    text: 'Яндекс восстановил сервисы. Газпром объявил дивиденды.' };
  assert.deepEqual(selectNews([roundup], config).companies, []);
});

void test('attributes a dated official press center story to its configured company', () => {
  const official: NewsItem = {
    ...item('Совет директоров утвердил дивиденды', 'https://gazprom.example/news/1', 'Газпром · сайт компании'),
    companySource: 'Газпром',
  };
  const selected = selectNews([official], config);
  assert.equal(selected.companies[0]?.company, 'Газпром');
  assert.equal(selected.companies[0]?.reason, 'Опубликовано на сайте компании Газпром');
});

void test('world news keeps five stories for every topic instead of one global limit', () => {
  const topics = { ...config, topics: [
    { name: 'США', keywords: [] }, { name: 'Израиль', keywords: [] },
  ] };
  const stories = topics.topics.flatMap((topic) => Array.from({ length: 7 }, (_, index) => ({
    ...item(`${topic.name} — событие ${index}`, `https://example.com/${topic.name}/${index}`, 'Издание'),
    category: 'world' as const, topic: topic.name, reason: '',
  } satisfies SelectedNews)));
  assert.deepEqual(worldNewsPerTopic(stories, topics, 5).map((news) => news.topic),
    [...Array<string>(5).fill('США'), ...Array<string>(5).fill('Израиль')]);
});

void test('topic selection reserves two places for other editions when one dominates the ranking', () => {
  const topicConfig = { ...config, topics: [{ name: 'США', keywords: [] }] };
  const stories = [
    ...Array.from({ length: 7 }, (_, index) => ({ ...item(`США новость ${index}`, `https://a.example/${index}`, 'ТАСС'), category: 'world' as const, topic: 'США', reason: '' })),
    { ...item('США другая новость', 'https://b.example/1', 'РБК'), category: 'world' as const, topic: 'США', reason: '' },
    { ...item('США третья новость', 'https://c.example/1', 'Reuters'), category: 'world' as const, topic: 'США', reason: '' },
  ];
  assert.deepEqual(worldNewsPerTopic(stories, topicConfig, 5).map((news) => news.source),
    ['ТАСС', 'ТАСС', 'ТАСС', 'РБК', 'Reuters']);
});

void test('one edition may fill the topic when no others are available', () => {
  const stories = Array.from({ length: 5 }, (_, index) => ({ ...item(`США новость ${index}`, `https://a.example/${index}`, 'ТАСС'), category: 'world' as const, topic: 'США', reason: '' }));
  assert.equal(diverseNews(stories, 5).length, 5);
  assert.equal(diverseNews(stories, 0).length, 0);
});

void test('precise Fed headline stays in Fed section when semantic classifier chooses USA', () => {
  const fedConfig = { ...config, topics: [
    { name: 'США', keywords: ['USA'] },
    { name: 'ФРС', keywords: ['Федрезерв', 'Federal Reserve', 'Fed', 'FOMC'] },
  ] };
  const story = item('Can the Fed Fight Inflation Without Hurting Farmers?', 'https://example.com/fed', 'Bloomberg');
  const selected = selectNews([story], fedConfig, new Map([[story.url, 'США']]), true);
  assert.equal(selected.world[0]?.topic, 'ФРС');
});
