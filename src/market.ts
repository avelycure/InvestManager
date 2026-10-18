import { requestUrl } from 'obsidian';
import type { DataPoint, IndexSeries, InvestSettings, SourceIssue } from './types';
import { runTasks, sourceConcurrency } from './task-runner';
import { imoexHistoryUrl, parseImoexHistory } from './imoex';

const EIA_URL = 'https://api.eia.gov/v2/seriesid/PET.RBRTE.D';
const GOLD_URL = 'https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities/GLDRUB_TOM.json?iss.meta=off';
const BRENT_FUTURES_URL = 'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.meta=off&securities.columns=SECID,SHORTNAME,LASTTRADEDATE,ASSETCODE,BOARDID&limit=1000';
const CURRENCY_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';
const CBR_RATE_URL = 'https://www.cbr.ru/hd_base/KeyRate/';
const CBR_CALENDAR_URL = 'https://www.cbr.ru/DKP/cal_mp/';
const FED_RATE_URL = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json';
const FED_CALENDAR_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';

interface MarketResult {
  points: DataPoint[];
  imoex?: IndexSeries;
  issues: SourceIssue[];
  checkedSources: number;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректный ответ источника');
  return value as JsonObject;
}

function firstRow(data: unknown, section: string): JsonObject {
  const block = object(object(data)[section]);
  const columns = block.columns;
  const rows = block.data;
  if (!Array.isArray(columns) || !Array.isArray(rows) || !Array.isArray(rows[0])) throw new Error('Нет данных');
  return Object.fromEntries(columns.map((column, index) => [String(column), (rows[0] as unknown[])[index]]));
}

function number(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function change(current: number, previous: number | undefined, unit: string, decimals: number): DataPoint['change'] {
  return previous !== undefined && Number.isFinite(previous) && previous > 0
    ? { amount: Number((current - previous).toFixed(decimals)), unit, decimals }
    : undefined;
}

function html(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/html');
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Некорректный XML');
  return doc;
}

function moscowDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function daysUntil(isoDay: string, now: Date): number {
  return Math.round((Date.parse(`${isoDay}T00:00:00Z`) - Date.parse(`${moscowDay(now)}T00:00:00Z`)) / 86400000);
}

function meetingPoint(label: string, start: string, end: string, now: Date, source: string, url: string): DataPoint {
  const days = daysUntil(start, now);
  const status = days < 0 ? 'идёт' : days === 0 ? 'сегодня' : `через ${days} дн.`;
  return { label, value: `${start === end ? start : `${start} — ${end}`} (${status})`, asOf: moscowDay(now), source, url };
}

async function textFrom(url: string): Promise<string> {
  const response = await requestUrl({ url, throw: true });
  return response.text;
}

async function brent(key: string): Promise<DataPoint> {
  if (!key.trim()) throw new Error('Укажите ключ EIA API в настройках');
  const url = `${EIA_URL}?api_key=${encodeURIComponent(key.trim())}&length=1`;
  const body = object(JSON.parse(await textFrom(url)));
  const rows = object(body.response).data;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Нет цены Brent');
  const row = object(rows[0]);
  const value = number(row.value);
  if (value === undefined || typeof row.period !== 'string') throw new Error('Нет цены Brent');
  return { label: 'Brent, спот', value: `${value.toFixed(2)} $/барр.`, asOf: row.period, source: 'EIA', url: 'https://www.eia.gov/dnav/pet/hist/RBRTED.htm' };
}

async function gold(): Promise<DataPoint> {
  const body = JSON.parse(await textFrom(GOLD_URL)) as unknown;
  const row = firstRow(body, 'marketdata');
  let security: JsonObject | undefined;
  try { security = firstRow(body, 'securities'); } catch { /* Quote remains useful without a prior close. */ }
  const lastTrade = number(row.LAST);
  const price = lastTrade ?? number(row.CLOSEPRICE);
  if (price === undefined) throw new Error('Нет цены GLDRUB_TOM');
  // ISS TIME is the trade time, while SYSTIME dates the market-data snapshot.
  // They are not a verified combined trade timestamp, especially after trading ends.
  const asOf = typeof row.SYSTIME === 'string' ? `срез ISS ${row.SYSTIME} МСК` : 'Время среза ISS не указано';
  return {
    label: `Золото GLDRUB_TOM, ${lastTrade === undefined ? 'цена закрытия' : 'последняя сделка'}`,
    value: `${price.toFixed(2)} ₽/г`, asOf, source: 'Московская биржа, CETS', url: GOLD_URL,
    change: change(price, number(security?.PREVPRICE), '₽/г', 2),
  };
}

async function brentFutures(): Promise<DataPoint> {
  const listing = object(JSON.parse(await textFrom(BRENT_FUTURES_URL)));
  const block = object(listing.securities);
  const columns = block.columns;
  const rows = block.data;
  if (!Array.isArray(columns) || !Array.isArray(rows)) throw new Error('Нет списка фьючерсов Brent');
  const contracts = rows.filter(Array.isArray).map((row) =>
    Object.fromEntries(columns.map((column, index) => [String(column), row[index]])),
  ).filter((row) => row.ASSETCODE === 'BR' && row.BOARDID === 'RFUD' &&
    typeof row.SECID === 'string' && typeof row.LASTTRADEDATE === 'string');
  const today = moscowDay(new Date());
  const nearest = contracts.filter((row) => (row.LASTTRADEDATE as string) >= today)
    .sort((a, b) => String(a.LASTTRADEDATE).localeCompare(String(b.LASTTRADEDATE)))[0];
  if (!nearest) throw new Error('Действующий фьючерс Brent не найден');
  const secid = String(nearest.SECID);
  const url = `https://iss.moex.com/iss/engines/futures/markets/forts/securities/${encodeURIComponent(secid)}.json?iss.meta=off`;
  const quote = JSON.parse(await textFrom(url)) as unknown;
  const market = firstRow(quote, 'marketdata');
  let security: JsonObject | undefined;
  try { security = firstRow(quote, 'securities'); } catch { /* Quote remains useful without a prior close. */ }
  const price = number(market.LAST);
  if (price === undefined) throw new Error('Нет цены ближайшего фьючерса Brent');
  const date = typeof market.TRADEDATE === 'string' ? market.TRADEDATE : '';
  const time = typeof market.TIME === 'string' ? market.TIME : '';
  const name = typeof nearest.SHORTNAME === 'string' ? nearest.SHORTNAME : secid;
  return {
    label: `Brent, фьючерс ${name}`,
    value: `${price.toFixed(2)} $/барр.`,
    asOf: date ? `${date}${time ? ` ${time} МСК` : ''}` : 'Дата сделки не указана',
    source: 'Московская биржа, RFUD',
    url,
    change: change(price, number(security?.PREVPRICE), '$/барр.', 2),
  };
}

async function currencies(): Promise<Map<string, DataPoint>> {
  const response = await requestUrl({ url: CURRENCY_URL, throw: true });
  // Банк России публикует этот XML в windows-1251.
  const doc = xml(new TextDecoder('windows-1251').decode(response.arrayBuffer));
  const published = doc.documentElement.getAttribute('Date') ?? '';
  let previous: Document | undefined;
  const parts = published.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (parts) {
    const day = new Date(Date.UTC(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])) - 86_400_000);
    const dateReq = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}/${day.getUTCFullYear()}`;
    try {
      const prior = await requestUrl({ url: `${CURRENCY_URL}?date_req=${dateReq}`, throw: true });
      previous = xml(new TextDecoder('windows-1251').decode(prior.arrayBuffer));
      if (previous.documentElement.getAttribute('Date') === published) previous = undefined;
    } catch { /* Current official rates remain available when comparison fails. */ }
  }
  const rate = (entry: Element): number | undefined => {
    const raw = entry.querySelector('VunitRate')?.textContent ?? entry.querySelector('Value')?.textContent ?? '';
    const value = number(raw.replace(',', '.'));
    const nominal = number(entry.querySelector('Nominal')?.textContent) ?? 1;
    return value === undefined ? undefined : entry.querySelector('VunitRate') ? value : value / nominal;
  };
  const results = new Map<string, DataPoint>();
  for (const entry of Array.from(doc.querySelectorAll('Valute'))) {
    const code = entry.querySelector('CharCode')?.textContent?.trim();
    if (code !== 'USD' && code !== 'CNY') continue;
    const value = rate(entry);
    if (value === undefined) continue;
    const oldEntry = Array.from(previous?.querySelectorAll('Valute') ?? []).find((item) => item.querySelector('CharCode')?.textContent?.trim() === code);
    results.set(code, {
      label: `${code}/RUB, официальный курс`,
      value: `${value.toFixed(4)} ₽`,
      asOf: published,
      source: 'Банк России',
      url: CURRENCY_URL,
      change: change(value, oldEntry ? rate(oldEntry) : undefined, '₽', 4),
    });
  }
  return results;
}

async function cbrRate(): Promise<DataPoint> {
  const doc = html(await textFrom(CBR_RATE_URL));
  const rows = Array.from(doc.querySelectorAll('table.data tr')).map((row) => row.querySelectorAll('td')).filter((cells) => cells.length >= 2);
  const date = rows[0]?.[0]?.textContent?.trim() ?? '';
  const rate = rows[0]?.[1]?.textContent?.trim() ?? '';
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date) || !/^\d+[,.]\d+$/.test(rate)) throw new Error('Не удалось прочитать ключевую ставку');
  const previous = number(rows[1]?.[1]?.textContent?.trim().replace(',', '.'));
  return { label: 'Ключевая ставка Банка России', value: `${rate}%`, asOf: date, source: 'Банк России', url: CBR_RATE_URL,
    change: change(Number(rate.replace(',', '.')), previous, 'п.п.', 2) };
}

async function fedRate(): Promise<DataPoint> {
  const body = object(JSON.parse(await textFrom(FED_RATE_URL.replace('/last/1.json', '/last/2.json'))));
  const rows = body.refRates;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Нет диапазона ставки ФРС');
  const row = object(rows[0]);
  const from = number(row.targetRateFrom);
  const to = number(row.targetRateTo);
  if (from === undefined || to === undefined || typeof row.effectiveDate !== 'string') throw new Error('Нет диапазона ставки ФРС');
  const prior = rows.length > 1 ? object(rows[1]) : undefined;
  return { label: 'Целевой диапазон ставки ФРС', value: `${from.toFixed(2)}–${to.toFixed(2)}%`, asOf: row.effectiveDate, source: 'ФРБ Нью-Йорка', url: FED_RATE_URL,
    change: change(to, number(prior?.targetRateTo), 'п.п.', 2) };
}

const RU_MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function cbrMeeting(now: Date): Promise<DataPoint> {
  const doc = html(await textFrom(CBR_CALENDAR_URL));
  const candidates: string[] = [];
  for (const item of Array.from(doc.querySelectorAll('.main-events_day'))) {
    if (!/Заседание Совета директоров Банка России по\s+ключевой ставке/i.test(item.textContent ?? '')) continue;
    const match = item.querySelector('.date')?.textContent?.replace(/\s+/g, ' ').match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
    if (!match) continue;
    const month = RU_MONTHS[match[2]?.toLowerCase() ?? ''];
    if (month) candidates.push(isoDay(Number(match[3]), month, Number(match[1])));
  }
  const next = candidates.sort().find((day) => daysUntil(day, now) >= 0);
  if (!next) throw new Error('Следующее заседание Банка России не найдено');
  return meetingPoint('Следующее заседание Банка России', next, next, now, 'Банк России', CBR_CALENDAR_URL);
}

const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function englishMonth(name: string): number | undefined {
  return EN_MONTHS[name] ?? Object.entries(EN_MONTHS).find(([full]) => full.startsWith(name) && name.length >= 3)?.[1];
}

async function fedMeeting(now: Date): Promise<DataPoint> {
  const doc = html(await textFrom(FED_CALENDAR_URL));
  const meetings: { start: string; end: string }[] = [];
  for (const panel of Array.from(doc.querySelectorAll('.panel.panel-default'))) {
    const yearMatch = panel.querySelector('.panel-heading')?.textContent?.match(/(20\d{2}) FOMC Meetings/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    for (const row of Array.from(panel.querySelectorAll('.fomc-meeting'))) {
      const monthName = row.querySelector('.fomc-meeting__month')?.textContent?.trim().toLowerCase() ?? '';
      const dateText = row.querySelector('.fomc-meeting__date')?.textContent?.replace(/\*/g, '').trim() ?? '';
      const monthParts = monthName.split('/');
      const month = englishMonth(monthParts[0] ?? '');
      const dateMatch = dateText.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
      if (!month || !dateMatch) continue;
      const startDay = Number(dateMatch[1]);
      const endDay = Number(dateMatch[2]);
      const endMonth = monthParts[1] ? englishMonth(monthParts[1]) : endDay < startDay ? month + 1 : month;
      if (!endMonth) continue;
      meetings.push({ start: isoDay(year, month, startDay), end: isoDay(year + (endMonth > 12 ? 1 : 0), ((endMonth - 1) % 12) + 1, endDay) });
    }
  }
  const next = meetings.sort((a, b) => a.start.localeCompare(b.start)).find((meeting) => daysUntil(meeting.end, now) >= 0);
  if (!next) throw new Error('Следующее заседание FOMC не найдено');
  return meetingPoint('Следующее заседание FOMC', next.start, next.end, now, 'Федеральная резервная система', FED_CALENDAR_URL);
}

export async function fetchMarket(settings: InvestSettings): Promise<MarketResult> {
  const points: DataPoint[] = [];
  let imoex: IndexSeries | undefined;
  const issues: SourceIssue[] = [];
  const errorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : 'Ошибка источника';
    const key = settings.eiaApiKey.trim();
    if (!key) return message;
    return message.replaceAll(key, '[скрыто]').replaceAll(encodeURIComponent(key), '[скрыто]');
  };
  const run = async (source: string, fn: () => Promise<DataPoint>): Promise<void> => {
    try { points.push(await fn()); }
    catch (error) { issues.push({ source, message: errorMessage(error) }); }
  };
  const work: (() => Promise<void>)[] = [];
  if (settings.imoexProvider === 'moex') work.push(async () => {
    try {
      const url = imoexHistoryUrl(new Date());
      const series = parseImoexHistory(JSON.parse(await textFrom(url)) as unknown, url);
      imoex = series;
      const last = series.points.at(-1)!;
      const prior = series.points.at(-2);
      points.push({ label: 'Индекс Мосбиржи IMOEX', value: `${last.close.toFixed(2)} п.`, asOf: last.date, source: 'Московская биржа, ISS', url,
        change: change(last.close, prior?.close, 'п.', 2) });
    } catch (error) { issues.push({ source: 'Индекс Мосбиржи IMOEX', message: errorMessage(error) }); }
  });
  if (settings.brentProvider === 'eia') work.push(() => run('EIA Brent', () => brent(settings.eiaApiKey)));
  else if (settings.brentProvider === 'moex') work.push(() => run('Мосбиржа Brent', brentFutures));
  if (settings.goldProvider === 'moex') work.push(() => run('Мосбиржа GLDRUB_TOM', gold));
  if (settings.usdProvider === 'cbr' || settings.cnyProvider === 'cbr') {
    work.push(() => currencies().then((rows) => {
      for (const [code, enabled] of [['USD', settings.usdProvider === 'cbr'], ['CNY', settings.cnyProvider === 'cbr']] as const) {
        if (!enabled) continue;
        const point = rows.get(code);
        if (point) points.push(point);
        else issues.push({ source: `Банк России ${code}`, message: 'Курс не найден' });
      }
    }).catch((error: unknown) => issues.push({ source: 'Банк России, курсы валют', message: errorMessage(error) })).then(() => undefined));
  }
  work.push(() => run('Банк России, ставка', cbrRate));
  work.push(() => run('ФРБ Нью-Йорка, диапазон ставки', fedRate));
  work.push(() => run('Банк России, календарь', () => cbrMeeting(new Date())));
  work.push(() => run('ФРС, календарь', () => fedMeeting(new Date())));
  await runTasks(work, sourceConcurrency(settings.llmProvider));
  const order = ['USD/RUB, официальный курс', 'CNY/RUB, официальный курс', 'Ключевая ставка Банка России', 'Целевой диапазон ставки ФРС', 'Следующее заседание Банка России', 'Следующее заседание FOMC'];
  const rank = (label: string): number => label.startsWith('Индекс Мосбиржи IMOEX') ? 0 : label.startsWith('Brent,') ? 1 : label.startsWith('Золото GLDRUB_TOM') ? 4 : order.indexOf(label) + (order.indexOf(label) >= 2 ? 3 : 2);
  points.sort((a, b) => rank(a.label) - rank(b.label));
  return { points, imoex, issues, checkedSources: work.length };
}
