import type { NewsFeedback, NewsRating, SelectedNews } from './types.ts';

export function excludedByFeedback(items: NewsFeedback[], news: SelectedNews): boolean {
  return items.some((entry) => entry.url === news.url
    && (entry.readAt || entry.rating === 'not-interesting' || (entry.rating === 'off-topic' && entry.topic === news.topic)));
}

export function feedbackExamples(items: NewsFeedback[], limit = 24): Array<{ title: string; topic?: string; rating: NewsRating }> {
  return items.filter((item): item is NewsFeedback & { rating: NewsRating; ratedAt: string } => Boolean(item.rating && item.ratedAt))
    .sort((a, b) => b.ratedAt.localeCompare(a.ratedAt)).slice(0, limit)
    .map(({ title, topic, rating }) => ({ title, topic, rating }));
}
