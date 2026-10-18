export interface PriceAxis {
  min: number;
  max: number;
  ticks: number[];
  decimals: number;
}

/** Rounded ruble levels around the observed prices, with room above and below the line. */
export function priceAxis(prices: number[]): PriceAxis {
  if (!prices.length || prices.some((price) => !Number.isFinite(price) || price <= 0)) throw new Error('Некорректные цены для графика');
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const visibleRange = Math.max(high - low, high * .001);
  const wantedStep = visibleRange * 1.16 / 4;
  const magnitude = 10 ** Math.floor(Math.log10(wantedStep));
  const fraction = wantedStep / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  let min = Math.floor((low - visibleRange * .08) / step) * step;
  let max = Math.ceil((high + visibleRange * .08) / step) * step;
  if (min === max) { min -= step; max += step; }
  if (max - min < 2 * step) { min -= step; max += step; }
  const count = Math.round((max - min) / step);
  const decimals = Math.min(4, Math.max(0, -Math.floor(Math.log10(step))));
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((min + index * step).toFixed(8)));
  min = ticks[0]!;
  max = ticks.at(-1)!;
  return { min, max, ticks, decimals };
}
