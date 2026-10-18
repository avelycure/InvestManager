import type { DigestResult, SavedDigest, SelectedNews } from './types';

export function saveDigestSnapshot(result: DigestResult): SavedDigest | undefined {
  if (!result.reportPath) return undefined;
  const item = (entry: SelectedNews): SavedDigest['world'][number] => ({
    title: entry.title, text: '', url: entry.url, source: entry.source,
    publishedAt: entry.publishedAt.toISOString(), channel: entry.channel, companySource: entry.companySource, publishedTimeKnown: entry.publishedTimeKnown,
    category: entry.category, company: entry.company, reason: entry.reason, topic: entry.topic, titleRu: entry.titleRu,
  });
  return {
    windowStart: result.windowStart.toISOString(), windowEnd: result.windowEnd.toISOString(),
    generatedAt: result.generatedAt.toISOString(),
    world: result.world.map(item), companies: result.companies.map(item),
    companyNews: result.companyNews?.map((group) => ({ company: group.company, ticker: group.ticker,
      press: group.press.map(item), news: group.news.map(item) })),
    worldBackfill: result.worldBackfill?.map((group) => ({ topic: group.topic, items: group.items.map(item) })),
    market: result.market, imoex: result.imoex, companyCapitalizations: result.companyCapitalizations,
    issues: result.issues, checkedSources: result.checkedSources,
    matchedCount: result.matchedCount,
    reportPath: result.reportPath,
  };
}

export function restoreDigestSnapshot(snapshot: SavedDigest | undefined): DigestResult | undefined {
  if (!snapshot?.reportPath || !Array.isArray(snapshot.world) || !Array.isArray(snapshot.companies)) return undefined;
  const start = new Date(snapshot.windowStart);
  const end = new Date(snapshot.windowEnd);
  const generated = new Date(snapshot.generatedAt);
  if (![start, end, generated].every((date) => Number.isFinite(date.getTime()))) return undefined;
  const restore = (entry: SavedDigest['world'][number]): SelectedNews | undefined => {
    const publishedAt = new Date(entry.publishedAt);
    if (!Number.isFinite(publishedAt.getTime())) return undefined;
    if (typeof entry.title !== 'string' || typeof entry.url !== 'string' || typeof entry.source !== 'string') return undefined;
    return { ...entry, publishedAt };
  };
  return {
    windowStart: start, windowEnd: end, generatedAt: generated,
    world: snapshot.world.map(restore).filter((item): item is SelectedNews => Boolean(item)),
    companies: snapshot.companies.map(restore).filter((item): item is SelectedNews => Boolean(item)),
    companyNews: snapshot.companyNews?.map((group) => ({ company: group.company, ticker: group.ticker,
      press: group.press.map(restore).filter((item): item is SelectedNews => Boolean(item)),
      news: group.news.map(restore).filter((item): item is SelectedNews => Boolean(item)) })),
    worldBackfill: snapshot.worldBackfill?.map((group) => ({ topic: group.topic,
      items: group.items.map(restore).filter((item): item is SelectedNews => Boolean(item)) })),
    market: Array.isArray(snapshot.market) ? snapshot.market : [], imoex: snapshot.imoex,
    companyCapitalizations: snapshot.companyCapitalizations,
    issues: Array.isArray(snapshot.issues) ? snapshot.issues : [],
    checkedSources: Number.isFinite(snapshot.checkedSources) ? snapshot.checkedSources : 0,
    matchedCount: snapshot.matchedCount,
    reportPath: snapshot.reportPath,
  };
}
