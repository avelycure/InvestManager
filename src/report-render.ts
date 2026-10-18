import { moscowDateKey, moscowHourMinute } from './time.ts';
import { formatRub } from './moex-company-market-data.ts';
import type { DataPoint, DigestResult, SelectedNews, SourceIssue } from './types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'] as const;

function readableDate(year: string, month: string, day: string, reportYear: string): string {
  const name = MONTHS[Number(month) - 1];
  if (!name) return `${year}-${month}-${day}`;
  return `${Number(day)} ${name}${year === reportYear ? '' : ` ${year}`}`;
}

function dateTime(date: Date, reportYear: string): string {
  const [year = '', month = '', day = ''] = moscowDateKey(date).split('-');
  return `${readableDate(year, month, day, reportYear)}, ${moscowHourMinute(date)}`;
}

function sourceDateText(value: string, reportYear: string): string {
  return value
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, year: string, month: string, day: string) => readableDate(year, month, day, reportYear))
    .replace(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g, (_, day: string, month: string, year: string) => readableDate(year, month, day, reportYear));
}

function safeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\|`*_])/g, '\\$1').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    url.username = '';
    url.password = '';
    return url.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch { return undefined; }
}

function sourceLink(label: string, url: string): string {
  const href = safeLink(url);
  return href ? `[${safeText(label)}](${href})` : safeText(label);
}

function sources(item: SelectedNews): string {
  const related = item.relatedSources?.slice(0, 3).map((source) => sourceLink(source.source, source.url)) ?? [];
  return [sourceLink(item.source, item.url), ...related].join(', ');
}

function shorten(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function marketIcon(label: string): string {
  if (label.startsWith('Индекс Мосбиржи')) return '📈';
  if (/^Brent\b/i.test(label)) return '🛢️';
  if (/^USD\/RUB\b/i.test(label)) return '💵';
  if (/^CNY\/RUB\b/i.test(label)) return '🇨🇳';
  if (label.startsWith('Золото')) return '🥇';
  if (label.startsWith('Ключевая ставка Банка России')) return '🏦';
  if (label.startsWith('Целевой диапазон ставки ФРС')) return '🇺🇸';
  if (label.startsWith('Следующее заседание Банка России')) return '🗓️';
  if (label.startsWith('Следующее заседание FOMC')) return '📅';
  return '📊';
}

function marketTable(points: DataPoint[], reportYear: string): string {
  if (!points.length) return '> [!warning] Рыночные данные недоступны.';
  return table(['Показатель', 'Значение', 'Изменение', 'На дату', 'Источник'], points.map((point) => {
    const change = point.change;
    const movement = change && Number.isFinite(change.amount) && change.amount !== 0
      ? `<span style="color:var(--color-${change.amount > 0 ? 'green, #188344' : 'red, #c93636'});font-weight:700">${change.amount > 0 ? '🟢 ▲' : '🔴 ▼'} ${Math.abs(change.amount).toFixed(change.decimals)} ${safeText(change.unit)}</span>`
      : change && change.amount === 0 ? 'Без изменений' : '—';
    return [
      `${marketIcon(point.label)} **${safeText(point.label)}**`, safeText(sourceDateText(point.value, reportYear)), movement,
      safeText(sourceDateText(point.asOf, reportYear)), sourceLink(point.source, point.url),
    ];
  }));
}

function detailedNews(items: SelectedNews[], reportYear: string): string {
  if (!items.length) return '_Новых событий нет._';
  return items.map((item) => {
    const label = item.company ? `**${safeText(item.company)}** · ` : '';
    const title = item.titleRu ?? item.title;
    const [year = '', month = '', day = ''] = moscowDateKey(item.publishedAt).split('-');
    const published = item.publishedTimeKnown === false ? readableDate(year, month, day, reportYear) : dateTime(item.publishedAt, reportYear);
    return `- ${label}**${safeText(shorten(title, 180))}** · ${published} · ${sources(item)}`;
  }).join('\n');
}

function groupedWorldNews(items: SelectedNews[], reportYear: string): string {
  if (!items.length) return '> [!info] По доступным источникам событий по выбранным темам не отобрано.';
  const groups = new Map<string, SelectedNews[]>();
  for (const item of items) {
    const topic = item.topic?.trim() || 'Другие темы';
    const group = groups.get(topic) ?? [];
    group.push(item);
    groups.set(topic, group);
  }
  return [...groups].map(([topic, news]) => `#### ${safeText(topic)}\n\n${detailedNews(news, reportYear)}`).join('\n\n');
}

function companyNews(groups: NonNullable<DigestResult['companyNews']>, windowStart: Date, windowEnd: Date, reportYear: string,
  capitalizations: DigestResult['companyCapitalizations']): string {
  if (!groups.length) return '> [!info] Компании не указаны в файле портфеля.';
  return [
    '_До пяти публикаций пресс-центра и трёх новостей из других источников на компанию. 🕘 — опубликовано раньше указанного периода._',
    '',
    groups.map((group) => {
      const items = [...group.press, ...group.news].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      const ticker = group.ticker && /^[A-Z0-9._-]{1,24}$/.test(group.ticker) ? group.ticker : '';
      const heading = `#### ${safeText(group.company)}${ticker ? ` · ${ticker}` : ''}`;
      const chart = ticker ? `\n\n\`\`\`invest-manager-stock\n${ticker}\n${windowEnd.toISOString()}\n\`\`\`` : '';
      const cap = ticker ? capitalizations?.[ticker] : undefined;
      const capitalization = `\n\n**Капитализация выпуска:** ${cap ? `${formatRub(cap.valueRub)} · ${sourceLink('Мосбиржа, ISS', cap.url)}` : 'нет данных'}`;
      if (!items.length) return `${heading}${chart}${capitalization}\n\n_Датированных публикаций в доступных источниках не найдено._`;
      const rows = items.map((item) => {
        const [year = '', month = '', day = ''] = moscowDateKey(item.publishedAt).split('-');
        const published = item.publishedTimeKnown === false ? readableDate(year, month, day, reportYear) : dateTime(item.publishedAt, reportYear);
        const date = `${item.publishedAt < windowStart ? '🕘 ' : ''}${published}`;
        return [safeText(date), `**${safeText(shorten(item.titleRu ?? item.title, 180))}**`, sources(item)];
      });
      return `${heading}${chart}${capitalization}\n\n${table(['Дата', 'Публикация', 'Источник'], rows)}`;
    }).join('\n\n'),
  ].join('\n');
}

function olderWorldNews(groups: NonNullable<DigestResult['worldBackfill']>, reportYear: string): string {
  if (!groups.length) return '';
  return `### 🕘 Последние доступные новости по темам · старше 24 часов\n\n`
    + `_В темах без новых событий показаны более ранние датированные публикации. Это не новости за указанный выше период._\n\n`
    + groups.map((group) => `#### ${safeText(group.topic)}\n\n${detailedNews(group.items, reportYear)}`).join('\n\n');
}

function coverage(issues: SourceIssue[]): string {
  if (!issues.length) return '> [!success] ✅ Все подключённые источники ответили.';
  return [`> [!warning]- ⚠️ Ограничения охвата · ${issues.length}`, ...issues.map((issue) => `> - **${safeText(issue.source)}:** ${safeText(issue.message)}`)].join('\n');
}

export function imoexChartBlock(series: NonNullable<DigestResult['imoex']>, end: Date): string {
  return ['#### 📈 Индекс Мосбиржи', '', '```invest-manager-imoex',
    JSON.stringify({ end: end.toISOString(), points: series.points, sourceUrl: series.sourceUrl }), '```'].join('\n');
}

export function renderDigest(result: DigestResult): string {
  const reportYear = moscowDateKey(result.generatedAt).slice(0, 4);
  const companyGroups = result.companyNews ?? [...new Set(result.companies.map((item) => item.company ?? 'Компания'))]
    .map((company) => ({ company,
      press: result.companies.filter((item) => (item.company ?? 'Компания') === company && item.companySource),
      news: result.companies.filter((item) => (item.company ?? 'Компания') === company && !item.companySource),
    }));
  const events = result.world.length + companyGroups.reduce((count, group) => count
    + [...group.press, ...group.news].filter((item) => item.publishedAt >= result.windowStart).length, 0);
  return [
    `## 📊 Инвестиционная статистика · ${dateTime(result.generatedAt, reportYear)} МСК`,
    '',
    `> [!summary] 📅 Период: ${dateTime(result.windowStart, reportYear)} — ${dateTime(result.windowEnd, reportYear)} МСК`,
    `> **Проверено источников:** ${result.checkedSources} · **Отобрано событий:** ${events}${result.matchedCount !== undefined && result.matchedCount > events ? ` из ${result.matchedCount} совпадений` : ''} · **Ограничений:** ${result.issues.length}`,
    '',
    '### ⚡ Главное',
    '',
    '#### 📊 Рынок, ставки и заседания',
    '',
    marketTable(result.market, reportYear),
    '',
    '_Изменение к предыдущему опубликованному значению; «—» — сравнение недоступно._',
    '',
    ...(result.imoex ? [imoexChartBlock(result.imoex, result.windowEnd), ''] : []),
    '### 🏢 Компании в портфеле',
    '',
    '_Капитализация относится к выпуску акций с указанным тикером; у компании могут быть другие выпуски._',
    '',
    companyNews(companyGroups, result.windowStart, result.windowEnd, reportYear, result.companyCapitalizations),
    '',
    '### 🌍 Новости в мире на сегодня',
    '',
    groupedWorldNews(result.world, reportYear),
    '',
    ...(result.worldBackfill?.length ? [olderWorldNews(result.worldBackfill, reportYear), ''] : []),
    coverage(result.issues),
  ].join('\n');
}
