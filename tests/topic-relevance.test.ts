import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTopics } from '../src/topic-config.ts';
import { selectNews } from '../src/selection.ts';
import { semanticTopicMatches } from '../src/topic-relevance.ts';
import type { ConfigFiles, NewsItem } from '../src/types.ts';

const config: ConfigFiles = {
  companies: [], channels: [], publications: [],
  topics: parseTopics('| Тема | Ключевые слова | Английские варианты |\n| --- | --- | --- |\n| Инфляция | инфляции; рост цен | inflation; consumer price index |', 'topics.md'),
};

function news(title: string, id: number, channel = false): NewsItem {
  return { title, text: title, url: `https://example.com/${id}`, source: 'Test', publishedAt: new Date('2026-10-17T06:00:00Z'), channel };
}

void test('Russian forms and English translations select the same topic', () => {
  const selected = selectNews([news('Инфляции замедлилась', 1), news('Consumer price index rose', 2)], config);
  assert.equal(selected.world.length, 2);
  assert.ok(selected.world.every((item) => item.topic === 'Инфляция'));
});

void test('semantic matching adds related stories without accepting unrelated ones or sending Telegram by default', async () => {
  const items = [news('Price pressures eased in September', 1), news('New spacecraft launched', 2), news('Prices may rise', 3, true)];
  let inspected: string[] = [];
  const result = await semanticTopicMatches(items, config, false, async (batch) => {
    inspected = batch.map((item) => item.title);
    return '[{"id":0,"topic":0},{"id":1,"topic":99}]';
  }, 1);
  assert.deepEqual(inspected, ['Price pressures eased in September', 'New spacecraft launched']);
  const selected = selectNews(items, config, result.matches);
  assert.deepEqual(selected.world.map((item) => item.title), ['Price pressures eased in September']);
  assert.equal(selected.world[0]?.reason, 'Подтверждено по смыслу');
});

void test('a literal keyword is rejected when semantic check does not confirm the topic', async () => {
  const rateConfig = { ...config, topics: [{ name: 'Ключевая ставка', keywords: ['ставка'] }] };
  const items = [news('Ставка на Северные потоки: Европа обсуждает газопровод', 1),
    news('ЦБ сохранил ключевую ставку', 2)];
  const result = await semanticTopicMatches(items, rateConfig, false, async () => '[{"id":0,"topic":0},{"id":1,"topic":0}]', 1);
  const selected = selectNews(items, rateConfig, result.matches, true);
  assert.deepEqual(selected.world.map((item) => item.title), ['ЦБ сохранил ключевую ставку']);
});

void test('an unassigned Python None does not discard valid topic matches in the batch', async () => {
  const items = [news('Consumer prices rose', 1), news('Spacecraft launched', 2)];
  const result = await semanticTopicMatches(items, config, false,
    async () => '[{"id":0,"topic":0},{"id":1,"topic":None}]', 1);
  assert.equal(result.matches.get(items[0]!.url), 'Инфляция');
  assert.equal(result.matches.has(items[1]!.url), false);
});

void test('topic parser uses the first valid array when the model adds extra text', async () => {
  const items = [news('Consumer prices rose', 1)];
  const result = await semanticTopicMatches(items, config, false,
    async () => 'Ответ: [{"id":0,"topic":0}]\nПояснение: [готово]', 1);
  assert.equal(result.matches.get(items[0]!.url), 'Инфляция');
});

void test('one malformed model batch does not discard matches from other batches', async () => {
  const items = Array.from({ length: 41 }, (_, index) => news(`Headline ${index}`, index));
  const result = await semanticTopicMatches(items, config, false,
    async (batch) => batch.length === 40 ? 'broken' : '[{"id":0,"topic":0}]', 2);
  assert.equal(result.failed, 1);
  assert.equal(result.matches.size, 1);
});

void test('geographic and central bank sections reject obvious unrelated headlines', async () => {
  const topics = { ...config, topics: [
    { name: 'Центральный банк', keywords: [] },
    { name: 'Европа', keywords: [] },
    { name: 'Война в Иране', keywords: [] },
  ] };
  const items = [news('Новак обсудил Северные потоки', 1), news('Протесты в Тунисе', 2),
    news('Битва за Таиз в Йемене', 3), news('Банк России сохранил ставку', 4),
    news('Во Франции прошли протесты', 5), news('КСИР сообщил об атаке в Ормузском проливе', 6)];
  const result = await semanticTopicMatches(items, topics, false,
    async () => '[{"id":0,"topic":0},{"id":1,"topic":1},{"id":2,"topic":2},{"id":3,"topic":0},{"id":4,"topic":1},{"id":5,"topic":2}]', 1);
  assert.deepEqual([...result.matches.values()], ['Центральный банк', 'Европа', 'Война в Иране']);
});
