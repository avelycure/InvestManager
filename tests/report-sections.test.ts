import assert from 'node:assert/strict';
import test from 'node:test';
import { latestReportSection, linkPreviousChartEmbeds, linkPreviousStockReportEmbeds, removeLegacyIfrsSections, removeLegacyPeRows, removeStandaloneCompanyMetrics, retirePreviousImoexCharts, retirePreviousStockCharts, upgradeLatestImoexChart } from '../src/report-sections.ts';

void test('repeated digest keeps one visible embed of an unchanged chart', () => {
  const chart = 'Статистика/2026/октябрь/IMOEX-abc.svg';
  const old = `## 📊 Инвестиционная статистика · 17 октября, 09:00 МСК\n\n![[${chart}|840]]\n`;
  const next = `## 📊 Инвестиционная статистика · 17 октября, 10:00 МСК\n\n![[${chart}|840]]\n`;
  const updated = `${linkPreviousChartEmbeds(old, chart)}\n${next}`;
  assert.equal(updated.match(/!\[\[/g)?.length, 1);
  assert.match(updated, /\[\[Статистика\/2026\/октябрь\/IMOEX-abc\.svg\|Открыть график IMOEX\]\]/);
  assert.equal(latestReportSection(updated), next.trim());
});

void test('repeat run retires old interactive stock charts while preserving articles', () => {
  const old = '#### Сбер · SBER\n\n```invest-manager-stock\nSBER\n2026-10-17T06:00:00.000Z\n```\n\n| Новость | Источник |';
  const next = '#### Сбер · SBER\n\n```invest-manager-stock\nSBER\n```';
  const combined = `${retirePreviousStockCharts(old)}\n\n${next}`;
  assert.equal((combined.match(/```invest-manager-stock/g) ?? []).length, 1);
  assert.match(combined, /\| Новость \| Источник \|/);
});

void test('new interactive IMOEX chart retires old SVG and older controls', () => {
  const old = '#### 📈 Индекс Мосбиржи · 30 дней\n\n![[Статистика/2026/октябрь/IMOEX-20261016-a1b2c3d4.svg|840]]\n\n'
    + '```invest-manager-imoex\n{"end":"2026-10-17T06:00:00Z"}\n```\n\nНовости';
  const updated = retirePreviousImoexCharts(old);
  assert.match(updated, /\[\[Статистика\/2026\/октябрь\/IMOEX-20261016-a1b2c3d4\.svg\|Открыть график IMOEX\]\]/);
  assert.doesNotMatch(updated, /!\[\[|```invest-manager-imoex/);
  assert.match(updated, /_График индекса показан в последнем отчёте ниже\._/);
  assert.match(updated, /Новости/);
});

void test('legacy daily note gains one interactive index chart without rerunning news', () => {
  const old = '## 📊 Инвестиционная статистика · утро\n\n#### 📈 Индекс Мосбиржи · 30 дней\n\n'
    + '![[Статистика/2026/октябрь/IMOEX-20261016-a1b2c3d4.svg|840]]\n\nДневные значения закрытия · [Мосбиржа](https://iss.moex.com/)\n\n'
    + '## 📊 Инвестиционная статистика · вечер\n\n#### 📈 Индекс Мосбиржи · 30 дней\n\n'
    + '![[Статистика/2026/октябрь/IMOEX-20261016-a1b2c3d4.svg|840]]\n\nДневные значения закрытия · [Мосбиржа](https://iss.moex.com/)\n\nНовости';
  const block = '#### 📈 Индекс Мосбиржи\n\n```invest-manager-imoex\n{"end":"2026-10-18T06:00:00Z"}\n```';
  const upgraded = upgradeLatestImoexChart(old, block);
  assert.equal((upgraded.match(/```invest-manager-imoex/g) ?? []).length, 1);
  assert.equal((upgraded.match(/!\[\[/g) ?? []).length, 0);
  assert.match(upgraded, /\[\[Статистика\/2026\/октябрь\/IMOEX-20261016-a1b2c3d4\.svg\|Открыть график IMOEX\]\]/);
  assert.match(upgraded, /Новости/);
  assert.equal(upgradeLatestImoexChart(upgraded, block), upgraded);
});

void test('new stock graph replaces the previous visible graph for the same ticker only', () => {
  const old = '![[Статистика/2026/октябрь/STOCK-SBER-20261016-a1b2c3d4.svg|840]]\n'
    + '![[Статистика/2026/октябрь/STOCK-PHOR-20261016-b1b2c3d4.svg|840]]';
  const updated = linkPreviousStockReportEmbeds(old, new Set(['SBER']));
  assert.match(updated, /\[\[Статистика\/2026\/октябрь\/STOCK-SBER-20261016-a1b2c3d4\.svg\|Открыть график SBER\]\]/);
  assert.match(updated, /!\[\[Статистика\/2026\/октябрь\/STOCK-PHOR-20261016-b1b2c3d4\.svg\|840\]\]/);
});

void test('old P/E placeholders disappear while other metrics stay', () => {
  const old = 'P/E не рассчитан: нужны капитализация всей компании и сопоставимая годовая прибыль.\n\n| Капитализация выпуска | 100 ₽ | ISS |\n| P/E | Не рассчитан | — |\n| Прибыль | 10 ₽ | МСФО |';
  const updated = removeLegacyPeRows(old);
  assert.doesNotMatch(updated, /P\/E/);
  assert.match(updated, /Капитализация выпуска/);
  assert.match(updated, /Прибыль/);
});

void test('retired IFRS blocks are removed without touching company charts or following reports', () => {
  const previous = '## Показатели компаний\n\n### Сбер (SBER)\n\n#### 📈 Цена акции\n\nГрафик\n\n#### МСФО · 2025\n\nПоказатели не извлечены.\n\n### Фосагро (PHOR)\n\n#### Рыночные показатели\n\nКапитализация\n\n#### МСФО · последний опубликованный полный год\n\nНе удалось получить страницу.\n\n## Инвестиционная статистика\n\nНовости';
  const updated = removeLegacyIfrsSections(previous);
  assert.doesNotMatch(updated, /МСФО|Показатели не извлечены|Не удалось получить страницу/);
  assert.match(updated, /#### 📈 Цена акции/);
  assert.match(updated, /Капитализация/);
  assert.match(updated, /## Инвестиционная статистика\n\nНовости/);
});

void test('standalone company metrics sections disappear while daily digests remain', () => {
  const old = '## 📊 Инвестиционная статистика · утро\n\nНовости\n\n## Показатели компаний · полдень\n\n### Сбер\n\nКапитализация\n\n## 📊 Инвестиционная статистика · вечер\n\nДругие новости\n\n## Показатели компаний · позднее\n\n### Фосагро\n\nГрафик';
  const updated = removeStandaloneCompanyMetrics(old);
  assert.doesNotMatch(updated, /Показатели компаний|Капитализация|Фосагро|График/);
  assert.match(updated, /Инвестиционная статистика · утро/);
  assert.match(updated, /Инвестиционная статистика · вечер/);
  assert.match(updated, /Другие новости/);
});
