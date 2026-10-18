import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyReportPath, reportPath } from '../src/report-path.ts';

void test('daily reports always target the fixed Statistics folder', () => {
  assert.equal(reportPath(new Date('2026-10-16T21:30:00Z')), 'Статистика/2026/октябрь/17 октября.md');
  assert.equal(legacyReportPath(new Date('2026-10-16T21:30:00Z')), 'Статистика/2026/10/2026-10-17.md');
});

void test('report path uses Russian month forms for folders and notes', () => {
  assert.equal(reportPath(new Date('2026-01-01T00:00:00Z')), 'Статистика/2026/январь/1 января.md');
  assert.equal(reportPath(new Date('2026-05-10T09:00:00Z')), 'Статистика/2026/май/10 мая.md');
});
