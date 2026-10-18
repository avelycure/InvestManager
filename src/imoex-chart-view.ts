import { loadImoexPeriod } from './imoex-chart-data';
import { capturedImoexPeriod, type ImoexChartSeries } from './imoex';
import { priceAxis } from './stock-chart-scale';
import type { StockPeriod } from './stock-chart-data';
import type { IndexSeries } from './types';

const PERIODS: Array<{ value: StockPeriod; label: string }> = [
  { value: 'day', label: '1 день' },
  { value: 'week', label: '1 неделя' },
  { value: 'twoWeeks', label: '2 недели' },
  { value: 'month', label: '1 месяц' },
  { value: 'year', label: '1 год' },
];
const SVG_NS = 'http://www.w3.org/2000/svg';

interface ChartInput { end: string; points: IndexSeries['points']; sourceUrl: string }

function chartInput(raw: string): { end: Date; snapshot: IndexSeries } {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Некорректные данные графика');
  const { end, points, sourceUrl } = parsed as Partial<ChartInput>;
  const date = new Date(end ?? '');
  if (!Number.isFinite(date.getTime()) || !Array.isArray(points) || points.length < 2 || points.length > 370
    || typeof sourceUrl !== 'string' || !sourceUrl.startsWith('https://iss.moex.com/iss/')) throw new Error('Некорректные данные графика');
  const valid = points.every((point) => point && typeof point.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.date)
    && typeof point.close === 'number' && Number.isFinite(point.close) && point.close > 0);
  if (!valid) throw new Error('Некорректные значения IMOEX');
  return { end: date, snapshot: { points, sourceUrl } };
}

function svgElement(tag: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function compactDate(value: string, day: boolean): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  return day ? `${label}, ${value.slice(11, 16)}` : label;
}

function drawChart(host: HTMLElement, series: ImoexChartSeries): void {
  host.empty();
  const values = series.candles;
  const first = values[0]!;
  const last = values.at(-1)!;
  const start = series.period === 'day' ? first.open : first.close;
  const difference = last.close - start;
  const percent = difference / start * 100;
  const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat';
  const price = host.createDiv({ cls: 'invest-manager-stock-chart__price' });
  price.createEl('strong', { text: `${last.close.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} п.` });
  price.createSpan({ cls: `invest-manager-stock-chart__change is-${direction}`,
    text: `${difference > 0 ? '+' : ''}${difference.toFixed(2)} п. (${percent > 0 ? '+' : ''}${percent.toFixed(2)}%)` });

  const axis = priceAxis([...values.map((item) => item.close), start]);
  const left = 96; const right = 740; const top = 14; const bottom = 166;
  const x = (index: number): number => left + index / Math.max(values.length - 1, 1) * (right - left);
  const y = (value: number): number => bottom - (value - axis.min) / (axis.max - axis.min) * (bottom - top);
  const color = direction === 'up' ? 'var(--color-green)' : direction === 'down' ? 'var(--color-red)' : 'var(--text-muted)';
  const svg = svgElement('svg', { viewBox: '0 0 780 202', role: 'img',
    'aria-label': `График IMOEX: ${first.close.toFixed(2)} — ${last.close.toFixed(2)} пункта` });
  const path = values.map((item, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(item.close).toFixed(1)}`).join(' ');
  for (const tick of axis.ticks) {
    const yy = y(tick);
    svg.appendChild(svgElement('line', { x1: String(left), y1: String(yy), x2: String(right), y2: String(yy), class: 'invest-manager-stock-chart__grid' }));
    const label = svgElement('text', { x: String(left - 10), y: String(yy + 4), 'text-anchor': 'end', class: 'invest-manager-stock-chart__axis' });
    label.textContent = `${tick.toLocaleString('ru-RU', { minimumFractionDigits: axis.decimals, maximumFractionDigits: axis.decimals })} п.`;
    svg.appendChild(label);
  }
  svg.appendChild(svgElement('path', { d: `${path} L${x(values.length - 1).toFixed(1)} ${bottom} L${left} ${bottom} Z`, fill: color, opacity: '.1' }));
  svg.appendChild(svgElement('path', { d: path, fill: 'none', stroke: color, 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.appendChild(svgElement('circle', { cx: x(values.length - 1).toFixed(1), cy: y(last.close).toFixed(1), r: '4', fill: color }));
  for (const [xx, item, anchor] of [[left, first, 'start'], [right, last, 'end']] as const) {
    const label = svgElement('text', { x: String(xx), y: '190', 'text-anchor': anchor, class: 'invest-manager-stock-chart__axis' });
    label.textContent = compactDate(item.begin, series.period === 'day');
    svg.appendChild(label);
  }
  host.appendChild(svg);
  const note = host.createDiv({ cls: 'invest-manager-stock-chart__note' });
  note.createSpan({ text: series.period === 'day' ? 'Изменение с открытия торгового дня' : 'Изменение от первого значения в периоде' });
  note.createEl('a', { text: 'Мосбиржа · источник', href: series.sourceUrl, attr: { target: '_blank', rel: 'noopener noreferrer' } });
}

export function renderImoexChart(el: HTMLElement, raw: string): void {
  let input: ReturnType<typeof chartInput>;
  try { input = chartInput(raw); }
  catch { el.setText('График IMOEX: некорректные данные.'); return; }
  const card = el.createDiv({ cls: 'invest-manager-stock-chart invest-manager-imoex-chart' });
  const header = card.createDiv({ cls: 'invest-manager-stock-chart__header' });
  header.createSpan({ cls: 'invest-manager-stock-chart__title', text: '📈 Индекс Мосбиржи · IMOEX' });
  const switcher = header.createDiv({ cls: 'invest-manager-stock-chart__switch', attr: { role: 'group', 'aria-label': 'Период графика IMOEX' } });
  const body = card.createDiv({ cls: 'invest-manager-stock-chart__body' });
  const cache = new Map<StockPeriod, ImoexChartSeries>();
  for (const period of ['week', 'twoWeeks', 'month'] as const) {
    const captured = capturedImoexPeriod(input.snapshot, period, input.end);
    if (captured) cache.set(period, captured);
  }
  let selected: StockPeriod = 'month';
  let version = 0;
  const buttons = PERIODS.map(({ value, label }) => {
    const button = switcher.createEl('button', { text: label, attr: { type: 'button', 'aria-pressed': String(value === selected) } });
    button.addEventListener('click', () => { void load(value); });
    return { value, button };
  });
  async function load(period: StockPeriod): Promise<void> {
    selected = period;
    const current = ++version;
    for (const { value, button } of buttons) button.setAttribute('aria-pressed', String(value === period));
    const cached = cache.get(period);
    if (cached) { drawChart(body, cached); return; }
    body.setText('Загружаю значения IMOEX…');
    try {
      const series = await loadImoexPeriod(period, input.end);
      cache.set(period, series);
      if (current === version && card.isConnected) drawChart(body, series);
    } catch (error) {
      if (current === version && card.isConnected) body.setText(`График недоступен: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  void load(selected);
}
