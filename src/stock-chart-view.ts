import { loadStockSeries, validStockTicker, type StockPeriod, type StockSeries } from './stock-chart-data';
import { priceAxis } from './stock-chart-scale';

const PERIODS: Array<{ value: StockPeriod; label: string }> = [
  { value: 'day', label: '1 день' },
  { value: 'week', label: '1 неделя' },
  { value: 'twoWeeks', label: '2 недели' },
  { value: 'month', label: '1 месяц' },
  { value: 'year', label: '1 год' },
];
const SVG_NS = 'http://www.w3.org/2000/svg';

let pending = 0;
const queue: Array<() => void> = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (pending >= 4) await new Promise<void>((resolve) => queue.push(resolve));
  pending++;
  try { return await task(); }
  finally { pending--; queue.shift()?.(); }
}

function compactDate(value: string, day: boolean): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  return day ? `${label}, ${value.slice(11, 16)}` : label;
}

function svgElement(tag: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawChart(host: HTMLElement, series: StockSeries): void {
  host.empty();
  const candles = series.candles;
  const first = candles[0]!;
  const last = candles.at(-1)!;
  const start = series.period === 'day' ? first.open : first.close;
  const change = last.close - start;
  const percent = change / start * 100;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const price = host.createDiv({ cls: 'invest-manager-stock-chart__price' });
  price.createEl('strong', { text: `${last.close.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽` });
  price.createSpan({ cls: `invest-manager-stock-chart__change is-${direction}`,
    text: ` ${change > 0 ? '+' : ''}${change.toFixed(2)} ₽ (${percent > 0 ? '+' : ''}${percent.toFixed(2)}%)` });

  const values = candles.map((candle) => candle.close);
  const axis = priceAxis([...values, start]);
  const left = 96;
  const right = 740;
  const top = 14;
  const bottom = 166;
  const x = (index: number): number => left + index / Math.max(candles.length - 1, 1) * (right - left);
  const y = (value: number): number => bottom - (value - axis.min) / (axis.max - axis.min) * (bottom - top);
  const color = direction === 'up' ? 'var(--color-green)' : direction === 'down' ? 'var(--color-red)' : 'var(--text-muted)';
  const svg = svgElement('svg', { viewBox: '0 0 780 202', role: 'img', 'aria-label': `График ${series.ticker}: ${first.close.toFixed(2)} — ${last.close.toFixed(2)} рубля` });
  const path = candles.map((candle, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(candle.close).toFixed(1)}`).join(' ');
  for (const tick of axis.ticks) {
    const yy = y(tick);
    svg.appendChild(svgElement('line', { x1: String(left), y1: String(yy), x2: String(right), y2: String(yy), class: 'invest-manager-stock-chart__grid' }));
    const label = svgElement('text', { x: String(left - 10), y: String(yy + 4), 'text-anchor': 'end', class: 'invest-manager-stock-chart__axis' });
    label.textContent = `${tick.toLocaleString('ru-RU', { minimumFractionDigits: axis.decimals, maximumFractionDigits: axis.decimals })} ₽`;
    svg.appendChild(label);
  }
  svg.appendChild(svgElement('path', { d: `${path} L${x(candles.length - 1).toFixed(1)} ${bottom} L${left} ${bottom} Z`, fill: color, opacity: '.1' }));
  svg.appendChild(svgElement('path', { d: path, fill: 'none', stroke: color, 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.appendChild(svgElement('circle', { cx: x(candles.length - 1).toFixed(1), cy: y(last.close).toFixed(1), r: '4', fill: color }));
  const labels = [[left, compactDate(first.begin, series.period === 'day'), 'start'], [right, compactDate(last.begin, series.period === 'day'), 'end']] as const;
  for (const [xx, label, anchor] of labels) {
    const text = svgElement('text', { x: String(xx), y: '190', 'text-anchor': anchor, class: 'invest-manager-stock-chart__axis' });
    text.textContent = label;
    svg.appendChild(text);
  }
  host.appendChild(svg);
  const note = host.createDiv({ cls: 'invest-manager-stock-chart__note' });
  note.createSpan({ text: series.period === 'day' ? 'Изменение с открытия последнего торгового дня' : 'Изменение от первого закрытия в периоде' });
  note.createEl('a', { text: 'Мосбиржа · источник', href: series.sourceUrl, attr: { target: '_blank', rel: 'noopener noreferrer' } });
}

export function renderStockChart(el: HTMLElement, rawTicker: string): void {
  const [ticker = '', endRaw] = rawTicker.trim().split('\n');
  if (!validStockTicker(ticker)) { el.setText('График: некорректный тикер.'); return; }
  const end = endRaw ? new Date(endRaw.trim()) : new Date();
  if (!Number.isFinite(end.getTime())) { el.setText('График: некорректная дата отчёта.'); return; }
  const card = el.createDiv({ cls: 'invest-manager-stock-chart' });
  const header = card.createDiv({ cls: 'invest-manager-stock-chart__header' });
  header.createSpan({ cls: 'invest-manager-stock-chart__title', text: `📈 ${ticker} · цена акции` });
  const switcher = header.createDiv({ cls: 'invest-manager-stock-chart__switch', attr: { role: 'group', 'aria-label': `Период графика ${ticker}` } });
  const body = card.createDiv({ cls: 'invest-manager-stock-chart__body' });
  let selected: StockPeriod = 'month';
  let version = 0;
  const buttons = PERIODS.map(({ value, label }) => {
    const button = switcher.createEl('button', { text: label, attr: { type: 'button', 'aria-pressed': String(value === selected) } });
    button.addEventListener('click', () => { void load(value); });
    return { value, button };
  });
  const cache = new Map<StockPeriod, StockSeries>();
  async function load(period: StockPeriod): Promise<void> {
    selected = period;
    const current = ++version;
    for (const { value, button } of buttons) button.setAttribute('aria-pressed', String(value === period));
    const cached = cache.get(period);
    if (cached) { drawChart(body, cached); return; }
    body.setText('Загружаю котировки Мосбиржи…');
    try {
      const series = await limited(() => loadStockSeries(ticker, period, end));
      cache.set(period, series);
      if (current === version) drawChart(body, series);
    } catch (error) {
      if (current === version) body.setText(`Котировки недоступны: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (typeof IntersectionObserver === 'undefined') { void load(selected); return; }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void load(selected); }
  }, { rootMargin: '300px' });
  observer.observe(card);
  window.setTimeout(() => { if (!card.isConnected) observer.disconnect(); }, 60_000);
}
