import { moscowDateKey } from './time.ts';
import type { NewsItem } from './types';

const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

function dated(value: string, referenceEnd: Date): { date: Date; exactTime: boolean } | undefined {
  const raw = value.replace(/\s+/g, ' ').replace(/(\d{4})\s*г\.?,?\s*(\d{1,2}:\d{2})/, '$1 $2').trim();
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:([+-]\d{2}:?\d{2}|Z))?)?/);
  const numeric = raw.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  const russian = raw.toLocaleLowerCase('ru-RU').match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?/);
  let year: number;
  let month: number;
  let day: number;
  let hour: number | undefined;
  let minute: number | undefined;
  let zone: string | undefined;
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
    hour = iso[4] === undefined ? undefined : Number(iso[4]);
    minute = iso[5] === undefined ? undefined : Number(iso[5]);
    zone = iso[7]?.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  } else if (numeric) {
    day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3]);
    hour = numeric[4] === undefined ? undefined : Number(numeric[4]);
    minute = numeric[5] === undefined ? undefined : Number(numeric[5]);
  } else if (russian) {
    day = Number(russian[1]); month = MONTHS[russian[2] ?? ''] ?? 0; year = Number(russian[3] ?? moscowDateKey(referenceEnd).slice(0, 4));
    hour = russian[4] === undefined ? undefined : Number(russian[4]);
    minute = russian[5] === undefined ? undefined : Number(russian[5]);
  } else return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31 || (hour !== undefined && (hour > 23 || minute === undefined || minute > 59))) return undefined;
  const local = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}:00${zone ?? '+03:00'}`;
  let date = new Date(local);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (russian && !russian[3] && date > referenceEnd) {
    year--;
    date = new Date(local.replace(/^\d{4}/, String(year)));
  }
  if (!zone && moscowDateKey(date) !== `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`) return undefined;
  return { date, exactTime: hour !== undefined };
}

function officialLink(raw: string, pageUrl: string): string | undefined {
  try {
    const page = new URL(pageUrl);
    const url = new URL(raw, pageUrl);
    const pageHost = page.hostname.replace(/^www\./, '').toLowerCase();
    const linkHost = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || linkHost !== pageHost || url.href === page.href) return undefined;
    return url.href;
  } catch { return undefined; }
}

function cardDate(card: Element, end: Date): { date: Date; exactTime: boolean } | undefined {
  const node = card.querySelector('time, [itemprop="datePublished"], [class*="date"], [class*="Date"]');
  if (!node) return undefined;
  const attribute = node.getAttribute('datetime') ?? node.getAttribute('content') ?? '';
  const visible = node.textContent ?? '';
  const time = card.querySelector('[class*="__time"]')?.textContent?.trim() ?? '';
  return dated(attribute.includes('T') ? attribute : `${visible || attribute} ${time}`, end) ?? dated(attribute, end);
}

export interface CompanyPageResult {
  items: NewsItem[];
  issue?: string;
}

/** Reads only clearly dated links from the configured news page; never guesses a publication date. */
export function parseCompanyNewsPage(
  html: string, pageUrl: string, companyName: string, start: Date, end: Date,
  parseDocument: (value: string) => Document = (value) => new DOMParser().parseFromString(value, 'text/html'),
): CompanyPageResult {
  const document = parseDocument(html);
  document.querySelectorAll('script, style, nav, body > footer, body > header').forEach((element) => element.remove());
  const cardSelector = 'article, [class*="news-item"], [class*="news_card"], [class*="news-card"], [class*="news-post"], [class*="new-moex-news-list__record"], [class*="panel-time-line"], [class*="press-item"], [class*="press__card"], [class*="lenta-item"], [itemtype*="NewsArticle"]';
  const cards = Array.from(document.querySelectorAll(cardSelector))
    .filter((card) => !card.parentElement?.closest(cardSelector));
  const items = new Map<string, NewsItem>();
  let undated = 0;
  let dateOnlyInWindow = 0;
  let recognized = 0;
  for (const card of cards.slice(0, 300)) {
    const anchor = card.matches('a[href]') ? card as HTMLAnchorElement : card.querySelector<HTMLAnchorElement>('h1 a[href], h2 a[href], h3 a[href], h4 a[href], a[href]');
    const url = anchor && officialLink(anchor.getAttribute('href') ?? '', pageUrl);
    const title = (card.matches('a[href]') ? card.querySelector('h1, h2, h3, h4')?.textContent : anchor?.textContent)?.replace(/\s+/g, ' ').trim() ?? '';
    if (!url || title.length < 8 || title.length > 250) continue;
    recognized++;
    const parsed = cardDate(card, end);
    if (!parsed) { undated++; continue; }
    if (!parsed.exactTime && parsed.date.getTime() < end.getTime()
      && parsed.date.getTime() + 24 * 60 * 60_000 > start.getTime()) dateOnlyInWindow++;
    // A date without a time proves membership only if the whole calendar day is inside the window.
    if (parsed.date < start || parsed.date > end || (!parsed.exactTime && parsed.date.getTime() + 24 * 60 * 60_000 > end.getTime())) continue;
    const text = card.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1200) || title;
    items.set(url, { title, text, url, source: `${companyName} · Пресс центр компании`, publishedAt: parsed.date, publishedTimeKnown: parsed.exactTime, companySource: companyName });
  }
  let issue: string | undefined;
  if (!recognized) issue = 'Не удалось распознать список публикаций на странице';
  else if (undated || dateOnlyInWindow) {
    const reasons = [];
    if (undated) reasons.push(`Публикаций без проверяемой даты исключено: ${undated}`);
    if (dateOnlyInWindow) reasons.push(`Публикаций с датой без времени: ${dateOnlyInWindow}; точный 24-часовой период не подтверждён`);
    issue = reasons.join('; ');
  }
  return { items: [...items.values()], issue };
}
