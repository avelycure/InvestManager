import { diverseNews, selectNews } from './selection.ts';
import { sixMonthsBefore } from './time.ts';
import type { ConfigFiles, NewsItem, SelectedNews } from './types';

/** Recent dated stories for topics with no selected story in the 24-hour report. */
export function worldBackfill(
  config: ConfigFiles, current: SelectedNews[], historical: NewsItem[], windowStart: Date,
  perTopic = 10, totalLimit = config.topics.length * perTopic,
  semanticTopics?: ReadonlyMap<string, string>, verifiedTopics = false,
): Array<{ topic: string; items: SelectedNews[] }> {
  const covered = new Set(current.map((item) => item.topic));
  const oldestAllowed = sixMonthsBefore(new Date(windowStart.getTime() + 24 * 60 * 60_000));
  const eligible = historical.filter((item) => !item.channel && !item.companySource
    && Number.isFinite(item.publishedAt.getTime()) && item.publishedAt >= oldestAllowed && item.publishedAt < windowStart);
  // Older feed descriptions often mention several unrelated topics. Require
  // the configured topic to appear in the headline itself for a fallback.
  const selected = selectNews(eligible.map((item) => ({ ...item, text: item.title })), config, semanticTopics, verifiedTopics).world;
  let remaining = totalLimit;
  return config.topics.filter((topic) => !covered.has(topic.name)).map((topic) => {
    const items = diverseNews(selected.filter((item) => item.topic === topic.name), Math.min(perTopic, remaining));
    remaining -= items.length;
    return { topic: topic.name, items };
  }).filter((group) => group.items.length > 0);
}
