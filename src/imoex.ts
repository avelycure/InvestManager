import { moscowDateKey } from './time.ts';
import type { IndexSeries } from './types';
import type { StockCandle, StockPeriod } from './stock-chart-data';

const DAY_MS = 86_400_000;
const HISTORY_BASE = 'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/IMOEX.json';
const CANDLES_BASE = 'https://iss.moex.com/iss/engines/stock/markets/index/securities/IMOEX/candles.json';

export interface ImoexChartSeries {
  period: StockPeriod;
  candles: StockCandle[];
  sourceUrl: string;
}

function dateBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

export function imoexCandlesUrl(interval: 10 | 24, from: string, till: string, start = 0): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(till)
    || !Number.isSafeInteger(start) || start < 0) throw new Error('Некорректный период IMOEX');
  const url = new URL(CANDLES_BASE);
  url.searchParams.set('interval', String(interval));
  url.searchParams.set('from', from);
  url.searchParams.set('till', till);
  url.searchParams.set('iss.meta', 'off');
  if (start) url.searchParams.set('start', String(start));
  return url.href;
}

/** The report's captured month is stable even when the live index changes. */
export function capturedImoexPeriod(snapshot: IndexSeries, period: 'week' | 'twoWeeks' | 'month', end: Date): ImoexChartSeries | undefined {
  const till = moscowDateKey(end);
  const days = { week: 7, twoWeeks: 14, month: 30 }[period];
  const from = dateBefore(till, days);
  const points = snapshot.points.filter((point) => point.date >= from && point.date <= till);
  if (points.length < 2) return undefined;
  return { period, candles: points.map((point) => ({ begin: `${point.date} 00:00:00`, open: point.close, close: point.close })),
    sourceUrl: snapshot.sourceUrl };
}

export function imoexHistoryUrl(now: Date): string {
  const till = moscowDateKey(now);
  const from = new Date(Date.parse(`${till}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  const url = new URL(HISTORY_BASE);
  url.searchParams.set('from', from);
  url.searchParams.set('till', till);
  url.searchParams.set('iss.meta', 'off');
  url.searchParams.set('history.columns', 'TRADEDATE,CLOSE');
  return url.href;
}

export function parseImoexHistory(payload: unknown, url: string): IndexSeries {
  if (!payload || typeof payload !== 'object') throw new Error('Некорректный ответ Мосбиржи по IMOEX');
  const block = (payload as Record<string, unknown>).history;
  if (!block || typeof block !== 'object') throw new Error('История IMOEX не найдена');
  const { columns, data } = block as { columns?: unknown; data?: unknown };
  if (!Array.isArray(columns) || !Array.isArray(data)) throw new Error('История IMOEX не найдена');
  const dateColumn = columns.indexOf('TRADEDATE');
  const closeColumn = columns.indexOf('CLOSE');
  if (dateColumn < 0 || closeColumn < 0) throw new Error('В истории IMOEX нет даты или значения закрытия');
  const points = new Map<string, number>();
  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const values = row as unknown[];
    const date = values[dateColumn];
    const close = values[closeColumn];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
    points.set(date, close);
  }
  const sorted = [...points].sort(([left], [right]) => left.localeCompare(right))
    .map(([date, close]) => ({ date, close }));
  if (sorted.length < 2) throw new Error('Недостаточно дневных значений IMOEX для графика');
  return { points: sorted, sourceUrl: url };
}

function shortDate(day: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

function signed(value: number, digits: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

/** Static SVG, built only from validated dates and finite numeric ISS values. */
export function renderImoexSvg(series: IndexSeries): string {
  const points = series.points;
  if (points.length < 2 || points.some((point) => !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(point.close) || point.close <= 0)) {
    throw new Error('Недостаточно данных IMOEX для графика');
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const values = points.map((point) => point.close);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.12, 12);
  const min = low - padding;
  const max = high + padding;
  const x0 = 88;
  const x1 = 920;
  const y0 = 98;
  const y1 = 268;
  const x = (index: number): number => x0 + (index / (points.length - 1)) * (x1 - x0);
  const y = (value: number): number => y1 - ((value - min) / (max - min)) * (y1 - y0);
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.close).toFixed(1)}`).join(' ');
  const area = `${line} L${x1} ${y1} L${x0} ${y1} Z`;
  const delta = last.close - first.close;
  const percent = delta / first.close * 100;
  const color = delta >= 0 ? '#0f766e' : '#c2410c';
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = min + (4 - index) * (max - min) / 4;
    const yy = y0 + index * (y1 - y0) / 4;
    return `<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" stroke="#dce3eb" stroke-width="1"/><text x="74" y="${(yy + 4).toFixed(1)}" text-anchor="end" class="axis">${value.toFixed(0)}</text>`;
  }).join('');
  const middle = points[Math.floor((points.length - 1) / 2)]!;
  const dates = [[x0, first.date, 'start'], [(x0 + x1) / 2, middle.date, 'middle'], [x1, last.date, 'end']]
    .map(([position, date, anchor]) => `<text x="${position}" y="301" text-anchor="${anchor}" class="axis">${shortDate(String(date))}</text>`).join('');
  const caption = `${shortDate(first.date)} — ${shortDate(last.date)} · ${points.length} торговых дней`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 338" role="img" aria-labelledby="title description">
<title id="title">Индекс Мосбиржи IMOEX за 30 календарных дней</title>
<desc id="description">Дневные значения закрытия: ${first.close.toFixed(2)} пункта ${shortDate(first.date)} — ${last.close.toFixed(2)} пункта ${shortDate(last.date)}, изменение ${signed(percent, 2)} процента.</desc>
<style>.title{font:700 22px system-ui,-apple-system,sans-serif;fill:#172638}.sub{font:14px system-ui,-apple-system,sans-serif;fill:#526375}.axis{font:12px system-ui,-apple-system,sans-serif;fill:#657588}.value{font:700 23px system-ui,-apple-system,sans-serif;fill:#172638}.change{font:700 15px system-ui,-apple-system,sans-serif;fill:${color}}</style>
<rect width="960" height="338" rx="14" fill="#f8fafc"/>
<text x="30" y="37" class="title">Индекс Мосбиржи · IMOEX</text>
<text x="30" y="60" class="sub">${caption} · закрытие торгового дня</text>
<text x="930" y="37" text-anchor="end" class="value">${last.close.toFixed(2)} п.</text>
<text x="930" y="59" text-anchor="end" class="change">${signed(delta, 2)} п. (${signed(percent, 2)}%)</text>
${grid}
<path d="${area}" fill="${color}" opacity="0.11"/>
<path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${x1}" cy="${y(last.close).toFixed(1)}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>
${dates}
<text x="930" y="325" text-anchor="end" class="axis">Источник: Московская биржа · ISS</text>
</svg>`;
}

export function imoexAssetPath(reportNotePath: string, series: IndexSeries): string {
  if (!/^Статистика\/\d{4}\/[^/]+\/[^/]+\.md$/.test(reportNotePath) || series.points.length < 2 ||
    series.points.some((point) => !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(point.close) || point.close <= 0)) {
    throw new Error('Некорректный путь графика IMOEX');
  }
  const folder = reportNotePath.slice(0, reportNotePath.lastIndexOf('/'));
  const points = series.points.map((point) => `${point.date}:${point.close.toFixed(2)}`).join('|');
  let hash = 2166136261;
  for (const char of points) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const last = series.points.at(-1)!.date.replaceAll('-', '');
  return `${folder}/IMOEX-${last}-${(hash >>> 0).toString(16).padStart(8, '0')}.svg`;
}
