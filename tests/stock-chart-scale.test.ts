import assert from 'node:assert/strict';
import test from 'node:test';
import { priceAxis } from '../src/stock-chart-scale.ts';

void test('price scale brackets stock candles with readable ruble marks', () => {
  const axis = priceAxis([273.8, 281.25, 287.48]);
  assert.ok(axis.min < 273.8 && axis.max > 287.48);
  assert.deepEqual(axis.ticks, [270, 275, 280, 285, 290]);
  assert.equal(axis.decimals, 0);
});

void test('small movements retain fractional price marks', () => {
  const axis = priceAxis([100.01, 100.04, 100.08]);
  assert.ok(axis.min < 100.01 && axis.max > 100.08);
  assert.ok(axis.decimals >= 2);
  assert.ok(axis.ticks.length >= 3 && axis.ticks.length <= 8);
});

void test('flat series still has a usable vertical range', () => {
  const axis = priceAxis([6089, 6089]);
  assert.ok(axis.min < 6089 && axis.max > 6089);
  assert.ok(axis.ticks.length >= 3);
});
