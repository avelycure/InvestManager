import assert from 'node:assert/strict';
import test from 'node:test';
import { afterMoscowTime, dueDigest, morningWindow, moscowDateKey, preparationTime, recentWindow, sixMonthsBefore } from '../src/time.ts';

void test('morning window closes at exactly 09:00 Moscow and spans 24 hours', () => {
  const window = morningWindow('2026-10-17');
  assert.equal(window.start.toISOString(), '2026-10-16T06:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-10-17T06:00:00.000Z');
  assert.equal(window.end.getTime() - window.start.getTime(), 86_400_000);
});

void test('manual or catch-up window ends at actual launch time', () => {
  const now = new Date('2026-10-17T07:32:00.000Z');
  const window = recentWindow(now);
  assert.equal(window.end.toISOString(), '2026-10-17T07:32:00.000Z');
  assert.equal(window.start.toISOString(), '2026-10-16T07:32:00.000Z');
});

void test('configured report time moves preparation and the exact 24-hour boundary', () => {
  const window = morningWindow('2026-10-17', '10:45');
  assert.equal(window.end.toISOString(), '2026-10-17T07:45:00.000Z');
  assert.equal(window.start.toISOString(), '2026-10-16T07:45:00.000Z');
  assert.equal(preparationTime('10:45'), '10:15');
  assert.equal(dueDigest(new Date('2026-10-17T07:14:00Z'), '10:45', ''), null);
  assert.deepEqual(dueDigest(new Date('2026-10-17T07:15:00Z'), '10:45', ''), { dateKey: '2026-10-17', phase: 'prepare' });
  assert.deepEqual(dueDigest(new Date('2026-10-17T07:45:00Z'), '10:45', ''), { dateKey: '2026-10-17', phase: 'run' });
});

void test('a report just after midnight starts preparing the previous day', () => {
  assert.equal(preparationTime('00:15'), '23:45');
  assert.deepEqual(dueDigest(new Date('2026-10-17T20:45:00Z'), '00:15', '2026-10-17'), { dateKey: '2026-10-18', phase: 'prepare' });
  assert.deepEqual(dueDigest(new Date('2026-10-17T21:15:00Z'), '00:15', '2026-10-17'), { dateKey: '2026-10-18', phase: 'run' });
  assert.throws(() => morningWindow('2026-10-17', '25:00'), /ЧЧ:ММ/);
});

void test('Moscow schedule and date do not use host timezone', () => {
  assert.equal(moscowDateKey(new Date('2026-10-16T21:30:00.000Z')), '2026-10-17');
  assert.equal(afterMoscowTime(new Date('2026-10-17T05:29:59.000Z'), 8, 30), false);
  assert.equal(afterMoscowTime(new Date('2026-10-17T05:30:00.000Z'), 8, 30), true);
  assert.equal(afterMoscowTime(new Date('2026-10-17T06:00:00.000Z'), 9), true);
});

void test('older news cutoff is six calendar months, including short months', () => {
  assert.equal(sixMonthsBefore(new Date('2026-10-18T06:00:00Z')).toISOString(), '2026-04-18T06:00:00.000Z');
  assert.equal(sixMonthsBefore(new Date('2026-08-31T06:00:00Z')).toISOString(), '2026-02-28T06:00:00.000Z');
});
