import assert from 'node:assert/strict';
import test from 'node:test';
import { finishNewsLanguage, needsRussianTranslation, russianModelText } from '../src/news-language.ts';
import type { SelectedNews } from '../src/types.ts';

const article: SelectedNews = {
  title: 'Federal Reserve holds interest rates steady', text: 'Federal Reserve holds interest rates steady',
  url: 'https://example.com/fed', source: 'Foreign newspaper', publishedAt: new Date('2026-10-17T06:00:00Z'),
  category: 'world', reason: 'Тема ФРС', summary: 'Federal Reserve holds rates unchanged',
};

void test('foreign excerpts require a Russian translation and never reuse an English summary as Russian', () => {
  assert.equal(needsRussianTranslation(article.title), true);
  assert.equal(russianModelText('Federal Reserve holds rates', 240), '');
  assert.equal(russianModelText('Перевод: Federal Reserve holds interest rates steady', 240), '');
  const missing = finishNewsLanguage([article]);
  assert.equal(missing.untranslated, 1);
  assert.equal(missing.items[0]?.summary, undefined);
  const translated = finishNewsLanguage([{ ...article, titleRu: 'ФРС сохранила процентную ставку', summary: 'Регулятор оставил ставку без изменений.' }]);
  assert.equal(translated.untranslated, 0);
  assert.equal(translated.items[0]?.summary, 'Регулятор оставил ставку без изменений.');
});
