interface IssTable { columns?: unknown; data?: unknown }

export interface IssueCapitalization {
  ticker: string;
  valueRub: number;
  url: string;
}

export function formatRub(value: number): string {
  const divisor = value >= 1_000_000_000_000 ? 1_000_000_000_000 : 1_000_000_000;
  const unit = divisor === 1_000_000_000_000 ? 'трлн' : 'млрд';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value / divisor)} ${unit} ₽`;
}

export function capitalizationUrl(ticker: string): string {
  if (!/^[A-Z0-9_.-]+$/.test(ticker)) throw new Error('Некорректный тикер');
  return `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${ticker}.json?iss.meta=off&marketdata.columns=SECID,BOARDID,ISSUECAPITALIZATION`;
}

export function parseIssueCapitalization(payload: unknown, ticker: string, url: string): IssueCapitalization | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const table = (payload as Record<string, unknown>).marketdata as IssTable | undefined;
  if (!Array.isArray(table?.columns) || !Array.isArray(table.data)) return undefined;
  const board = table.columns.indexOf('BOARDID');
  const security = table.columns.indexOf('SECID');
  const cap = table.columns.indexOf('ISSUECAPITALIZATION');
  if (board < 0 || security < 0 || cap < 0) return undefined;
  const rows = table.data.filter((row): row is unknown[] => Array.isArray(row) && row[security] === ticker
    && typeof row[cap] === 'number' && Number.isFinite(row[cap]) && row[cap] > 0);
  const row = rows.find((entry) => entry[board] === 'TQBR') ?? rows[0];
  return row ? { ticker, valueRub: row[cap] as number, url } : undefined;
}
