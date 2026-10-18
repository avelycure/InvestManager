import type { ConfigFiles, NewsItem } from './types';
import type { NewsFeedback } from './types';
import { feedbackExamples } from './feedback-policy.ts';
import { firstJsonArray } from './json-array.ts';

const BATCH_SIZE = 40;
const MAX_ITEMS = 240;

function plausibleAssignment(item: NewsItem, topic: string): boolean {
  if (/ключев.*ставк|interest rate|policy rate/i.test(topic)) {
    return /ключев|центральн|\bцб\b|\bфрс\b|банк россии|денежн|процентн|рефинансир|fomc|federal reserve|central bank|interest rate|policy rate/i.test(item.title);
  }
  if (/^центральный банк$/i.test(topic)) {
    return /центробанк|центральн.{0,12}банк|нацбанк|банк россии|\bцб\b|федрезерв|\bфрс\b|central bank|national bank|federal reserve|\bECB\b/i.test(item.title);
  }
  if (/^европа$/i.test(topic)) {
    return /европ|евросоюз|\bЕС\b|франц|герман|румын|венгр|словаки|польш|итал|испан|британи|лондон|париж|берлин|брюссел|\bФРГ\b|europe|european|\bEU\b|france|germany|romania|hungary|slovakia|poland|italy|spain|britain|london|paris|berlin|brussels/i.test(item.title);
  }
  if (/^война в иране$/i.test(topic)) {
    return /иран|тегеран|ормуз|ксир|персидск|iran|tehran|hormuz|irgc|persian gulf/i.test(item.title);
  }
  return true;
}

export function topicCandidates(items: NewsItem[], config: ConfigFiles, includeTelegram: boolean): NewsItem[] {
  const unique = new Map<string, NewsItem>();
  for (const item of items) {
    if ((item.channel && !includeTelegram) || item.companySource) continue;
    if (!unique.has(item.url)) unique.set(item.url, item);
  }
  return [...unique.values()].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function parseTopicMatches(response: string, batch: NewsItem[], config: ConfigFiles): Map<string, string> {
  const parsed = firstJsonArray(response);
  const matches = new Map<string, string>();
  for (const value of parsed) {
    if (!value || typeof value !== 'object') continue;
    const { id, topic } = value as Record<string, unknown>;
    if (!Number.isInteger(id) || !Number.isInteger(topic)) continue;
    const item = batch[id as number];
    const name = config.topics[topic as number]?.name;
    if (item && name && plausibleAssignment(item, name) && !matches.has(item.url)) matches.set(item.url, name);
  }
  return matches;
}

export async function semanticTopicMatches(
  items: NewsItem[], config: ConfigFiles, includeTelegram: boolean,
  classify: (batch: NewsItem[], topics: ConfigFiles['topics'], examples: ReturnType<typeof feedbackExamples>) => Promise<string>,
  concurrency: number, feedback: NewsFeedback[] = [], maxItems = MAX_ITEMS,
): Promise<{ matches: Map<string, string>; skipped: number; failed: number }> {
  const candidates = topicCandidates(items, config, includeTelegram);
  const chosen = candidates.slice(0, maxItems);
  const batches: NewsItem[][] = [];
  for (let offset = 0; offset < chosen.length; offset += BATCH_SIZE) batches.push(chosen.slice(offset, offset + BATCH_SIZE));
  const matches = new Map<string, string>();
  const examples = feedbackExamples(feedback);
  let next = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      if (!batch) continue;
      try {
        const result = parseTopicMatches(await classify(batch, config.topics, examples), batch, config);
        for (const [url, topic] of result) matches.set(url, topic);
      } catch { failed++; }
    }
  }));
  return { matches, skipped: candidates.length - chosen.length, failed };
}
