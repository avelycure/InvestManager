import { requestUrl } from 'obsidian';
import { moscowDateKey } from './time';

export type StockPeriod = 'day' | 'week' | 'twoWeeks' | 'month' | 'year';
export interface StockCandle { begin: string; open: number; close: number }
export interface StockSeries { ticker: string; period: StockPeriod; candles: StockCandle[]; sourceUrl: string }

const BASE = 'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities';
const DAY_MS = 86_400_000;

export function validStockTicker(ticker: string): boolean {
  return /^[A-Z0-9._-]{1,24}$/.test(ticker);
}

function dateBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

export function stockCandlesUrl(ticker: string, interval: 10 | 24, from: string, till: string, start = 0): string {
  if (!validStockTicker(ticker) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(till)) throw new Error('Некорректный тикер или дата');
  const url = new URL(`${BASE}/${ticker}/candles.json`);
  url.searchParams.set('interval', String(interval));
  url.searchParams.set('from', from);
  url.searchParams.set('till', till);
  url.searchParams.set('iss.meta', 'off');
  if (start) url.searchParams.set('start', String(start));
  return url.href;
}

export function parseStockCandles(payload: unknown): StockCandle[] {
  if (!payload || typeof payload !== 'object') throw new Error('Мосбиржа вернула некорректные данные');
  const block = (payload as Record<string, unknown>).candles as { columns?: unknown; data?: unknown } | undefined;
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) throw new Error('Свечи Мосбиржи не найдены');
  const openIndex = block.columns.indexOf('open');
  const closeIndex = block.columns.indexOf('close');
  const beginIndex = block.columns.indexOf('begin');
  if (openIndex < 0 || closeIndex < 0 || beginIndex < 0) throw new Error('В данных Мосбиржи нет цены или даты');
  return block.data.flatMap((row: unknown) => {
    if (!Array.isArray(row)) return [];
    const values: unknown[] = row;
    const open = values[openIndex];
    const close = values[closeIndex];
    const begin = values[beginIndex];
    if (typeof open !== 'number' || typeof close !== 'number' || !Number.isFinite(open) || !Number.isFinite(close)
      || open <= 0 || close <= 0 || typeof begin !== 'string' || !/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(begin)) return [];
    return [{ begin, open, close }];
  });
}

async function candles(ticker: string, interval: 10 | 24, from: string, till: string): Promise<{ candles: StockCandle[]; url: string }> {
  let start = 0;
  const values = new Map<string, StockCandle>();
  const url = stockCandlesUrl(ticker, interval, from, till);
  for (let page = 0; page < 20; page++) {
    const response = await requestUrl({ url: stockCandlesUrl(ticker, interval, from, till, start), throw: false });
    if (response.status !== 200) throw new Error(`Мосбиржа вернула HTTP ${response.status}`);
    const batch = parseStockCandles(response.json);
    for (const item of batch) values.set(item.begin, item);
    if (batch.length < 500) break;
    start += batch.length;
    if (page === 19) throw new Error('История цен слишком длинная');
  }
  return { candles: [...values.values()].sort((a, b) => a.begin.localeCompare(b.begin)), url };
}

export async function loadStockSeries(ticker: string, period: StockPeriod, now = new Date()): Promise<StockSeries> {
  if (!validStockTicker(ticker)) throw new Error('Некорректный тикер');
  const till = moscowDateKey(now);
  if (period === 'day') {
    const daily = await candles(ticker, 24, dateBefore(till, 14), till);
    const latest = daily.candles.at(-1)?.begin.slice(0, 10);
    if (!latest) throw new Error('По этой акции нет доступных торгов за последние 14 дней');
    const intraday = await candles(ticker, 10, latest, latest);
    const cutoff = `${till} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
    const visible = intraday.candles.filter((item) => latest !== till || item.begin.slice(0, 16) <= cutoff);
    if (!visible.length) throw new Error('Нет внутридневных данных к моменту отчёта');
    return { ticker, period, candles: visible, sourceUrl: intraday.url };
  }
  const days = { week: 7, twoWeeks: 14, month: 30, year: 365 }[period];
  const history = await candles(ticker, 24, dateBefore(till, days), till);
  if (!history.candles.length) throw new Error('По этой акции нет доступных цен за выбранный период');
  return { ticker, period, candles: history.candles, sourceUrl: history.url };
}
