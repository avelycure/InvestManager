import assert from 'node:assert/strict';
import test from 'node:test';
import { capitalizationUrl, parseIssueCapitalization } from '../src/moex-company-market-data.ts';

void test('uses one primary-board issue capitalization without summing duplicate boards', () => {
  const url = capitalizationUrl('PHOR');
  const value = parseIssueCapitalization({ marketdata: {
    columns: ['SECID', 'BOARDID', 'ISSUECAPITALIZATION'],
    data: [['PHOR', 'SPEQ', 700_000_000_000], ['PHOR', 'TQBR', 735_000_000_000]],
  } }, 'PHOR', url);
  assert.deepEqual(value, { ticker: 'PHOR', valueRub: 735_000_000_000, url });
});

void test('ignores missing, zero and other-security capitalization', () => {
  const url = capitalizationUrl('PHOR');
  assert.equal(parseIssueCapitalization({ marketdata: {
    columns: ['SECID', 'BOARDID', 'ISSUECAPITALIZATION'],
    data: [['SBER', 'TQBR', 6_000_000_000_000], ['PHOR', 'TQBR', 0]],
  } }, 'PHOR', url), undefined);
  assert.throws(() => capitalizationUrl('../PHOR'));
});
