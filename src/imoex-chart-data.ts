import { requestUrl } from 'obsidian';
import { parseStockCandles, type StockCandle, type StockPeriod } from './stock-chart-data';
import { imoexCandlesUrl, type ImoexChartSeries } from './imoex';
import { moscowDateKey, moscowHourMinute } from './time';
const DAY_MS = 86_400_000;

function dateBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

async function candles(interval: 10 | 24, from: string, till: string): Promise<{ candles: StockCandle[]; url: string }> {
  const values = new Map<string, StockCandle>();
  const url = imoexCandlesUrl(interval, from, till);
  let start = 0;
  for (let page = 0; page < 20; page++) {
    const response = await requestUrl({ url: imoexCandlesUrl(interval, from, till, start), throw: false });
    if (response.status !== 200) throw new Error(`Мосбиржа вернула HTTP ${response.status}`);
    const batch = parseStockCandles(response.json);
    for (const item of batch) values.set(item.begin, item);
    if (batch.length < 500) break;
    start += batch.length;
    if (page === 19) throw new Error('История IMOEX слишком длинная');
  }
  return { candles: [...values.values()].sort((a, b) => a.begin.localeCompare(b.begin)), url };
}

export async function loadImoexPeriod(period: StockPeriod, end: Date): Promise<ImoexChartSeries> {
  if (!Number.isFinite(end.getTime())) throw new Error('Некорректная дата отчёта');
  const till = moscowDateKey(end);
  if (period === 'day') {
    const daily = await candles(24, dateBefore(till, 14), till);
    const latest = daily.candles.at(-1)?.begin.slice(0, 10);
    if (!latest) throw new Error('Нет торгов IMOEX за последние 14 дней');
    const intraday = await candles(10, latest, latest);
    const cutoff = `${till} ${moscowHourMinute(end)}`;
    const visible = intraday.candles.filter((item) => latest !== till || item.begin.slice(0, 16) <= cutoff);
    if (!visible.length) throw new Error('Нет внутридневных значений IMOEX к моменту отчёта');
    return { period, candles: visible, sourceUrl: intraday.url };
  }
  const days = { week: 7, twoWeeks: 14, month: 30, year: 365 }[period];
  const history = await candles(24, dateBefore(till, days), till);
  if (!history.candles.length) throw new Error('Нет значений IMOEX за выбранный период');
  return { period, candles: history.candles, sourceUrl: history.url };
}
