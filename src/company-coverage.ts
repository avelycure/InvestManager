import { selectNews } from './selection.ts';
import { sixMonthsBefore } from './time.ts';
import type { ConfigFiles, NewsItem, SelectedNews } from './types';

export interface CompanyNewsGroup {
  company: string;
  ticker: string;
  press: SelectedNews[];
  news: SelectedNews[];
}

function isArticle(item: NewsItem): boolean {
  return Number.isFinite(item.publishedAt.getTime())
    && !/^\d{1,2}\.?\s*\d{4}$/.test(item.title.trim())
    && !/#server-rendered-pressreleaselist-month-/i.test(item.url);
}

function latest(items: SelectedNews[], limit: number): SelectedNews[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isArticle(item)) return false;
    const key = item.url.replace(/[?#].*$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, limit);
}

/** A company always gets one combined block: up to 5 official and 5 other stories. */
export function companyCoverage(
  config: ConfigFiles, current: SelectedNews[], historical: NewsItem[],
  windowStart: Date, pressLimit = 5, newsLimit = 5,
): CompanyNewsGroup[] {
  const oldestAllowed = sixMonthsBefore(new Date(windowStart.getTime() + 24 * 60 * 60_000));
  const eligible = historical.filter((item) => isArticle(item) && item.publishedAt >= oldestAllowed && item.publishedAt < windowStart);
  const official = eligible.filter((item) => item.companySource && config.companies.some((company) => company.name === item.companySource))
    .map((item): SelectedNews => ({ ...item, category: 'company', company: item.companySource,
      reason: `Опубликовано на сайте компании ${item.companySource}` }));
  const older = [...official, ...selectNews(eligible.filter((item) => !item.companySource)
    .map((item) => ({ ...item, text: item.title })), config).companies];
  const all = [...current, ...older];
  return config.companies.map((company) => {
    const items = all.filter((item) => item.company === company.name);
    return { company: company.name, ticker: company.ticker,
      press: latest(items.filter((item) => item.companySource === company.name), pressLimit),
      news: latest(items.filter((item) => !item.companySource), newsLimit),
    };
  });
}
