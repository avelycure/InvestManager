import assert from 'node:assert/strict';
import test from 'node:test';
import { capturedImoexPeriod, imoexAssetPath, imoexCandlesUrl, imoexHistoryUrl, parseImoexHistory, renderImoexSvg } from '../src/imoex.ts';

void test('IMOEX history uses the last 30 Moscow calendar days and parses daily closes', () => {
  const url = imoexHistoryUrl(new Date('2026-10-17T06:00:00Z'));
  assert.match(url, /from=2026-09-18/);
  assert.match(url, /till=2026-10-17/);
  const series = parseImoexHistory({ history: {
    columns: ['TRADEDATE', 'CLOSE'],
    data: [['2026-10-16', 2431.07], ['2026-10-15', 2391.72], ['2026-10-14', null]],
  } }, url);
  assert.deepEqual(series.points, [
    { date: '2026-10-15', close: 2391.72 },
    { date: '2026-10-16', close: 2431.07 },
  ]);
  const svg = renderImoexSvg(series);
  assert.match(svg, /<svg[^>]+viewBox="0 0 960 338"/);
  assert.match(svg, /2431\.07 п\./);
  assert.match(svg, /\+1\.65%/);
  assert.match(svg, /Дневные значения закрытия/);
});

void test('chart asset stays beside its report and rejects paths outside Statistics', () => {
  const series = { points: [{ date: '2026-10-15', close: 2391.72 }, { date: '2026-10-16', close: 2431.07 }], sourceUrl: 'https://iss.moex.com/' };
  const path = imoexAssetPath('Статистика/2026/октябрь/17 октября.md', series);
  assert.match(path, /^Статистика\/2026\/октябрь\/IMOEX-20261016-[0-9a-f]{8}\.svg$/);
  assert.equal(imoexAssetPath('Статистика/2026/октябрь/18 октября.md', series), path);
  assert.notEqual(imoexAssetPath('Статистика/2026/октябрь/17 октября.md', { ...series, points: [...series.points.slice(0, 1), { date: '2026-10-16', close: 2432 }] }), path);
  assert.throws(() => imoexAssetPath('Другая папка/17 октября.md', series), /Некорректный путь/);
});

void test('interactive IMOEX uses index candles and filters captured weekly ranges', () => {
  const url = imoexCandlesUrl(10, '2026-10-16', '2026-10-16');
  assert.match(url, /markets\/index\/securities\/IMOEX\/candles\.json/);
  assert.match(url, /interval=10/);
  assert.throws(() => imoexCandlesUrl(24, '../other', '2026-10-16'), /Некорректный период/);
  const snapshot = { points: [
    { date: '2026-09-30', close: 2200 }, { date: '2026-10-10', close: 2300 },
    { date: '2026-10-15', close: 2391.72 }, { date: '2026-10-16', close: 2431.07 },
  ], sourceUrl: 'https://iss.moex.com/iss/history/IMOEX.json' };
  const end = new Date('2026-10-17T06:00:00Z');
  assert.deepEqual(capturedImoexPeriod(snapshot, 'week', end)?.candles.map((item) => item.close), [2300, 2391.72, 2431.07]);
  assert.equal(capturedImoexPeriod(snapshot, 'month', end)?.candles.length, 4);
});
