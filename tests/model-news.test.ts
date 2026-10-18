import assert from 'node:assert/strict';
import test from 'node:test';
import { modelEligibleNews } from '../src/model-news.ts';
import type { SelectedNews } from '../src/types.ts';

void test('Telegram posts enter the LLM only after explicit opt-in', () => {
  const base = { title: 'Новость', text: 'Текст', url: 'https://example.com', source: 'Источник', publishedAt: new Date(), category: 'world' as const, reason: 'Тема' };
  const items: SelectedNews[] = [{ ...base, channel: true }, { ...base, url: 'https://example.org' }];
  assert.deepEqual(modelEligibleNews(items).map((item) => item.url), ['https://example.org']);
  assert.deepEqual(modelEligibleNews(items, true).map((item) => item.url), ['https://example.com', 'https://example.org']);
});
