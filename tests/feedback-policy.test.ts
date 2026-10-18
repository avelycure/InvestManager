import assert from 'node:assert/strict';
import test from 'node:test';
import { excludedByFeedback, feedbackExamples } from '../src/feedback-policy.ts';
import type { NewsFeedback, SelectedNews } from '../src/types.ts';

const news: SelectedNews = { title: 'ЦБ сохранил ключевую ставку', text: '', url: 'https://example.org/1',
  source: 'Издание', publishedAt: new Date('2026-10-17T06:00:00Z'), category: 'world', topic: 'Ключевая ставка', reason: '' };

void test('off-topic rating suppresses the exact article and topic', () => {
  const rated: NewsFeedback[] = [{ url: news.url, title: news.title, source: news.source,
    topic: news.topic, rating: 'off-topic', ratedAt: '2026-10-17T07:00:00Z' }];
  assert.equal(excludedByFeedback(rated, news), true);
  assert.equal(excludedByFeedback(rated, { ...news, topic: 'Банки' }), false);
  assert.equal(excludedByFeedback([{ ...rated[0]!, rating: 'helpful' }], news), false);
  assert.equal(excludedByFeedback([{ ...rated[0]!, rating: 'not-interesting' }], { ...news, topic: 'Банки' }), true);
});

void test('recent feedback becomes compact examples for the model', () => {
  const examples = feedbackExamples([
    { url: 'https://example.org/a', title: 'Older', source: 'A', topic: 'Нефть', rating: 'helpful', ratedAt: '2026-10-15T07:00:00Z' },
    { url: 'https://example.org/b', title: 'Newer', source: 'B', topic: 'Ключевая ставка', rating: 'off-topic', ratedAt: '2026-10-17T07:00:00Z' },
  ], 1);
  assert.deepEqual(examples, [{ title: 'Newer', topic: 'Ключевая ставка', rating: 'off-topic' }]);
});

void test('read articles are hidden across topics without changing editorial ratings', () => {
  const feedback: NewsFeedback[] = [
    { url: news.url, title: news.title, source: news.source, topic: news.topic,
      rating: 'helpful', ratedAt: '2026-10-17T07:00:00Z', readAt: '2026-10-18T07:00:00Z' },
    { url: 'https://example.org/2', title: 'Read only', source: news.source,
      readAt: '2026-10-18T07:00:00Z' },
  ];
  assert.equal(excludedByFeedback(feedback, news), true);
  assert.equal(excludedByFeedback(feedback, { ...news, topic: 'Банки' }), true);
  assert.equal(excludedByFeedback(feedback, { ...news, url: 'https://example.org/2' }), true);
  assert.deepEqual(feedbackExamples(feedback), [{ title: news.title, topic: news.topic, rating: 'helpful' }]);
});
