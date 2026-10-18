import type { FeedObservation } from './news';
import type { NewsItem, Publication, SourceIssue } from './types';

export interface CachedArticle extends Omit<NewsItem, 'publishedAt'> {
  publishedAt: string;
  feedUrl: string;
}

export interface CachedFeed {
  source: string;
  coverageFrom?: string;
  coverageStartedAt?: string;
  lastFetchedAt: string;
  oldestPublishedAt?: string;
  entryCount: number;
  undatedCount: number;
  hasNextPage: boolean;
}

export interface RssCacheState {
  version: 1;
  articles: CachedArticle[];
  feeds: Record<string, CachedFeed>;
}

export const EMPTY_RSS_CACHE: RssCacheState = { version: 1, articles: [], feeds: {} };
const RETENTION_MS = 72 * 60 * 60_000;
const MAX_ARTICLES = 20_000;

function validTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function articleKey(item: { url: string; feedUrl: string }): string {
  return `${item.feedUrl}\n${item.url.replace(/[?#].*$/, '').toLowerCase()}`;
}

export function recordFeeds(
  state: RssCacheState,
  publications: Publication[],
  observations: FeedObservation[],
  freshItems: NewsItem[],
  now: Date,
): RssCacheState {
  const allowed = new Map(publications.map((item) => [item.url, item.name]));
  const articles = new Map<string, CachedArticle>();
  const cutoff = now.getTime() - RETENTION_MS;
  for (const item of state.articles) {
    if (allowed.has(item.feedUrl) && (validTime(item.publishedAt) ?? 0) >= cutoff) articles.set(articleKey(item), item);
  }
  const feeds: Record<string, CachedFeed> = {};
  for (const [url, feed] of Object.entries(state.feeds)) {
    if (allowed.has(url) && (validTime(feed.lastFetchedAt) ?? 0) >= cutoff) feeds[url] = feed;
  }
  for (const observation of observations) {
    if (!allowed.has(observation.url)) continue;
    const previous = feeds[observation.url];
    const oldest = validTime(observation.oldestPublishedAt);
    const fetched = validTime(observation.fetchedAt);
    if (fetched === undefined) continue;
    const previousFetch = validTime(previous?.lastFetchedAt);
    // A later snapshot overlaps the previous fetch only when its oldest article
    // predates that fetch. Otherwise the feed may have rotated while we slept.
    const overlaps = oldest !== undefined && previousFetch !== undefined && oldest <= previousFetch && fetched >= previousFetch;
    const coverageFrom = overlaps && previous?.coverageFrom ? previous.coverageFrom : observation.oldestPublishedAt;
    feeds[observation.url] = {
      source: allowed.get(observation.url) ?? observation.source,
      coverageFrom, coverageStartedAt: overlaps ? previous?.coverageStartedAt ?? previous?.lastFetchedAt ?? observation.fetchedAt : observation.fetchedAt,
      lastFetchedAt: observation.fetchedAt,
      oldestPublishedAt: observation.oldestPublishedAt,
      entryCount: observation.entryCount, undatedCount: observation.undatedCount,
      hasNextPage: observation.hasNextPage,
    };
  }
  for (const item of freshItems) {
    if (item.channel || item.companySource) continue;
    const sameNameFeeds = publications.filter((publication) => publication.name === item.source);
    const feedUrl = item.feedUrl ?? (sameNameFeeds.length === 1 ? sameNameFeeds[0]?.url : undefined);
    if (!feedUrl || !Number.isFinite(item.publishedAt.getTime()) || item.publishedAt.getTime() < cutoff) continue;
    const cached: CachedArticle = { ...item, text: item.text.slice(0, 3_000), publishedAt: item.publishedAt.toISOString(), feedUrl };
    articles.set(articleKey(cached), cached);
  }
  return { version: 1, feeds, articles: [...articles.values()]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_ARTICLES) };
}

export function cachedWindow(state: RssCacheState, publications: Publication[], start: Date, end: Date): {
  items: NewsItem[]; issues: SourceIssue[];
} {
  const allowed = new Map(publications.map((item) => [item.url, item.name]));
  const items: NewsItem[] = [];
  for (const item of state.articles) {
    const source = allowed.get(item.feedUrl);
    const time = validTime(item.publishedAt);
    if (!source || time === undefined || time < start.getTime() || time > end.getTime()) continue;
    const { feedUrl: _feedUrl, ...news } = item;
    items.push({ ...news, source, publishedAt: new Date(time) });
  }
  const issues: SourceIssue[] = [];
  for (const [url, source] of allowed) {
    const feed = state.feeds[url];
    if (!feed) continue; // The fresh fetch reports its own error.
    const reasons: string[] = [];
    if (feed.undatedCount) reasons.push(`${feed.undatedCount} записей без даты исключены`);
    if (feed.hasNextPage) reasons.push('есть следующая страница, архив пока не прочитан');
    const coverageFrom = validTime(feed.coverageFrom);
    if (coverageFrom === undefined || coverageFrom > start.getTime()) {
      const oldest = feed.oldestPublishedAt ? new Date(feed.oldestPublishedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) : 'нет датированных записей';
      const started = feed.coverageStartedAt ? new Date(feed.coverageStartedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) : undefined;
      reasons.push(`полный охват пока не подтверждён${started ? `: история собирается с ${started}` : ''}; в последней выдаче ${feed.entryCount} записей, самая ранняя — ${oldest}`);
    }
    if ((validTime(feed.lastFetchedAt) ?? 0) < end.getTime() - 20 * 60_000) {
      reasons.push('после последней проверки ленты до конца периода прошло более 20 минут');
    }
    if (reasons.length) issues.push({ source, message: reasons.join('; ') });
  }
  return { items, issues };
}
