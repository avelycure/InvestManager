import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { applyCompanyCardColors, companyBrandColor, companyCalloutType, validBrandColor } from '../src/company-brand.ts';

void test('known logo colours have defaults and a configured colour takes precedence', () => {
  assert.equal(companyBrandColor({ ticker: 'SBER' }), '#21A038');
  assert.equal(companyBrandColor({ ticker: 'LKOH' }), '#D71920');
  assert.equal(companyBrandColor({ ticker: 'SIBN' }), '#0077C8');
  assert.equal(companyBrandColor({ ticker: 'PHOR' }), '#1479B8');
  assert.equal(companyBrandColor({ ticker: 'ROSN' }), '#E7B929');
  assert.equal(companyBrandColor({ ticker: 'UNKNOWN' }), undefined);
  assert.equal(companyBrandColor({ ticker: 'SBER', color: '#123abc' }), '#123ABC');
  assert.equal(companyCalloutType('#123ABC'), 'invest-company-123abc');
});

void test('only six-digit hex values are accepted for card colour', () => {
  assert.equal(validBrandColor('#21A038'), true);
  for (const value of ['red', '#123', '#123456;opacity:0', 'url(example)', '#gggggg']) {
    assert.equal(validBrandColor(value), false);
    assert.equal(companyCalloutType(value), 'invest-company');
  }
});

void test('rendered company callout receives only its encoded colour', () => {
  const { document } = parseHTML('<div id="root"><div class="callout" data-callout="invest-company-21a038"></div>'
    + '<div class="callout" data-callout="invest-company-bad"></div></div>');
  const root = document.querySelector<HTMLElement>('#root')!;
  applyCompanyCardColors(root);
  const cards = root.querySelectorAll<HTMLElement>('.callout');
  assert.equal(cards[0]?.style.getPropertyValue('--invest-company-accent'), '#21a038');
  assert.equal(cards[1]?.style.getPropertyValue('--invest-company-accent'), '');
});
