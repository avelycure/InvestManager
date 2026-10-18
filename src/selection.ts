import type { ConfigFiles, NewsItem, SelectedNews } from './types';

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((word) => word.length >= 4)
    .map((word) => /^[а-яё]+$/i.test(word) && word.length > 5 ? word.slice(0, 5) : word));
}

function literalTopic(title: string, name: string, keywords: string[]): boolean {
  const heading = ` ${normalize(title)} `;
  const matched = [name, ...keywords].some((word) => normalize(word).length >= 3
    && heading.includes(` ${normalize(word)} `));
  if (!matched) return false;
  if (/ключев.*ставк|interest rate|policy rate|ставк.*(?:цб|фрс)/i.test(name)) {
    return /ключев|центральн|\bцб\b|\bфрс\b|банк россии|денежн|процентн|рефинансир|fomc|federal reserve|central bank|interest|policy/i.test(title);
  }
  return true;
}

function sameEvent(left: SelectedNews, right: SelectedNews): boolean {
  if (left.category !== right.category || left.company !== right.company) return false;
  const a = tokens(left.title);
  const b = tokens(right.title);
  if (a.size < 3 || b.size < 3) return false;
  const common = [...a].filter((word) => b.has(word)).length;
  return common / Math.min(a.size, b.size) >= 0.7;
}

function mergeEvents(items: SelectedNews[]): SelectedNews[] {
  const events: SelectedNews[] = [];
  for (const item of items) {
    const existing = events.find((event) => event.url === item.url || sameEvent(event, item));
    if (!existing) { events.push({ ...item }); continue; }
    if (existing.url !== item.url && existing.source !== item.source) {
      const links = existing.relatedSources ?? [];
      if (!links.some((link) => link.url === item.url)) {
        existing.relatedSources = [...links, { source: item.source, url: item.url }];
      }
    }
  }
  return events;
}

export function selectNews(items: NewsItem[], config: ConfigFiles, semanticTopics?: ReadonlyMap<string, string>, verifiedTopics = false): { world: SelectedNews[]; companies: SelectedNews[]; matchedCount: number } {
  const world: SelectedNews[] = [];
  const companies: SelectedNews[] = [];
  const unique = new Map<string, NewsItem>();
  for (const item of items) {
    const key = item.url.replace(/\?.*$/, '').toLowerCase();
    if (!unique.has(key) || item.companySource) unique.set(key, item);
  }
  for (const item of unique.values()) {
    // Feed descriptions and Telegram posts can contain unrelated roundups.
    // Attribute a publication only when its headline names the company.
    const haystack = ` ${normalize(item.title)} `;
    const company = config.companies.find((candidate) => {
      if (item.companySource) return candidate.name === item.companySource;
      const name = normalize(candidate.name);
      const ticker = candidate.ticker.toLowerCase();
      return (name.length >= 4 && haystack.includes(` ${name} `)) || haystack.includes(` ${ticker} `);
    });
    if (company) companies.push({ ...item, category: 'company', company: company.name, reason: item.companySource ? `Опубликовано на сайте компании ${company.name}` : `Относится к компании ${company.name}` });
    const topic = config.topics.find((candidate) => literalTopic(item.title, candidate.name, candidate.keywords));
    const specificTopic = config.topics.find((candidate) =>
      /^(?:ключевая ставка (?:сша|рф)|фрс|центральный банк)$/i.test(candidate.name)
      && literalTopic(item.title, candidate.name, candidate.keywords));
    const semanticTopic = semanticTopics?.get(item.url);
    const matchedTopic = specificTopic ?? config.topics.find((candidate) => candidate.name === semanticTopic)
      ?? (verifiedTopics ? undefined : topic);
    if (matchedTopic && !company) world.push({ ...item, category: 'world', topic: matchedTopic.name,
      reason: semanticTopic ? 'Подтверждено по смыслу' : 'Совпадение по ключевым словам' });
  }
  const newestFirst = (a: SelectedNews, b: SelectedNews): number => b.publishedAt.getTime() - a.publishedAt.getTime();
  return {
    world: mergeEvents(world.sort(newestFirst)),
    companies: mergeEvents(companies.sort(newestFirst)),
    matchedCount: world.length + companies.length,
  };
}

export function worldNewsPerTopic(items: SelectedNews[], config: ConfigFiles, limit: number): SelectedNews[] {
  return config.topics.flatMap((topic) => diverseNews(items.filter((item) => item.topic === topic.name), limit));
}

/** Keep the editorial order, reserve room for other sources, then fill any gaps. */
export function diverseNews(items: SelectedNews[], limit: number, perSource = 3): SelectedNews[] {
  if (limit <= 0) return [];
  const selected: SelectedNews[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const item of items) {
    const source = item.source.trim().toLocaleLowerCase('ru-RU');
    if (seen.has(item.url) || (counts.get(source) ?? 0) >= perSource) continue;
    selected.push(item);
    seen.add(item.url);
    counts.set(source, (counts.get(source) ?? 0) + 1);
    if (selected.length >= limit) return selected;
  }
  for (const item of items) {
    if (seen.has(item.url)) continue;
    selected.push(item);
    seen.add(item.url);
    if (selected.length >= limit) break;
  }
  return selected;
}
