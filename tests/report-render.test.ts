import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDigest } from '../src/report-render.ts';
import type { DigestResult } from '../src/types.ts';

void test('digest uses readable dates, tables and a collapsible coverage section', () => {
  const result: DigestResult = {
    windowStart: new Date('2026-10-16T06:00:00Z'),
    windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'),
    market: [{ label: 'Brent', value: '90.10 $/барр.', asOf: '2026-10-16 18:00 МСК', source: 'Биржа', url: 'https://example.com/oil', change: { amount: -0.45, unit: '$/барр.', decimals: 2 } },
      { label: 'USD/RUB', value: '84.0000 ₽', asOf: '17.10.2026', source: 'ЦБ', url: 'https://example.com/rate', change: { amount: 0.1234, unit: '₽', decimals: 4 } },
      { label: 'Заседание ЦБ', value: '2027-01-10', asOf: '17.10.2026', source: 'ЦБ', url: 'https://example.com/rate' }],
    imoex: { points: [{ date: '2026-10-15', close: 2391.72 }, { date: '2026-10-16', close: 2431.07 }], sourceUrl: 'https://iss.moex.com/iss/history/engines/stock/markets/index/securities/IMOEX.json' },
    companies: [{ title: 'Результат | компании', text: 'Результат', url: 'https://example.com/news', source: 'Издание', publishedAt: new Date('2026-10-17T04:00:00Z'), category: 'company', company: 'Компания', reason: 'Компания' },
      { title: 'Новость пресс-центра', text: 'Новость', url: 'https://example.com/press', source: 'Пресс центр компании', companySource: 'Компания', publishedAt: new Date('2026-10-16T21:00:00Z'), publishedTimeKnown: false, category: 'company', company: 'Компания', reason: 'Сайт компании' }],
    world: [], issues: [{ source: 'Лента', message: 'нет ответа' }], checkedSources: 2,
  };
  const markdown = renderDigest(result);
  assert.match(markdown, /16 октября, 09:00 — 17 октября, 09:00 МСК/);
  assert.match(markdown, /^## 📊 Инвестиционная статистика · 17 октября, 09:05 МСК/);
  assert.match(markdown, /\| Показатель \| Значение \| Изменение \| На дату \| Источник \|/);
  assert.match(markdown, /🔴 ▼ 0\.45 \$\/барр\./);
  assert.match(markdown, /🟢 ▲ 0\.1234 ₽/);
  assert.match(markdown, /Без изменений| — \|/);
  assert.match(markdown, /### ⚡ Главное\n/);
  assert.match(markdown, /### 🏢 Компании в портфеле\n/);
  assert.doesNotMatch(markdown, /### 📰 Пресс центр компании\n/);
  assert.match(markdown, /#### 📈 Индекс Мосбиржи\n\n```invest-manager-imoex\n/);
  assert.match(markdown, /"end":"2026-10-17T06:00:00\.000Z"/);
  assert.doesNotMatch(markdown, /!\[\[Статистика\/2026\/октябрь\/IMOEX-/);
  assert.match(markdown, /### 🌍 Новости в мире на сегодня\n/);
  assert.doesNotMatch(markdown, /Главное за 30 секунд/);
  assert.match(markdown, /Результат \\\| компании/);
  assert.match(markdown, /10 января 2027/);
  assert.match(markdown, /> \[!warning\]- ⚠️ Ограничения охвата · 1/);
  assert.doesNotMatch(markdown, /\| 2026-10-16 \||17\.10\.2026/);
  assert.match(markdown, /\| 17 октября \| \*\*Новость пресс-центра\*\*/);
  assert.doesNotMatch(markdown, /17 октября, 00:00 \| \*\*Новость пресс-центра/);
});

void test('each market parameter has a recognizable icon', () => {
  const labels: Array<[string, string]> = [
    ['Индекс Мосбиржи IMOEX', '📈'],
    ['Brent, фьючерс BR-11.26', '🛢️'],
    ['USD/RUB, официальный курс', '💵'],
    ['CNY/RUB, официальный курс', '🇨🇳'],
    ['Золото GLDRUB_TOM, последняя сделка', '🥇'],
    ['Ключевая ставка Банка России', '🏦'],
    ['Целевой диапазон ставки ФРС', '🇺🇸'],
    ['Следующее заседание Банка России', '🗓️'],
    ['Следующее заседание FOMC', '📅'],
  ];
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'),
    market: labels.map(([label], index) => ({ label, value: '1', asOf: '2026-10-17', source: 'Источник', url: `https://example.com/${index}` })),
    world: [], companies: [], issues: [], checkedSources: 1,
  });
  for (const [label, icon] of labels) assert.ok(markdown.includes(`| ${icon} **${label.replaceAll('_', '\\_')}** |`), label);
});

void test('report shows translated excerpts with links to original publications', () => {
  const article = {
    title: 'Federal Reserve holds interest rates steady', titleRu: 'ФРС сохранила процентную ставку',
    text: 'Federal Reserve holds interest rates steady', summary: 'Регулятор оставил ставку без изменений.',
    url: 'https://example.com/fed', source: 'Foreign newspaper', publishedAt: new Date('2026-10-17T05:00:00Z'),
    category: 'world' as const, topic: 'ФРС', reason: 'Совпадение по смыслу',
  };
  const second = { ...article, title: 'Fed chair speaks after decision', titleRu: 'Председатель ФРС выступил после решения',
    url: 'https://example.com/fed-chair', publishedAt: new Date('2026-10-17T04:00:00Z') };
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], companies: [], world: [article, second], issues: [], checkedSources: 1,
  });
  assert.equal((markdown.match(/> \[!invest-topic\] 🗞️ ФРС · 2 новости/g) ?? []).length, 1);
  assert.match(markdown, /ФРС сохранила процентную ставку/);
  assert.match(markdown, /Председатель ФРС выступил после решения/);
  assert.match(markdown, /\[Foreign newspaper\]\(https:\/\/example\.com\/fed\)/);
  assert.doesNotMatch(markdown, /Federal Reserve holds interest rates steady/);
  assert.doesNotMatch(markdown, /\*\*Суть:\*\*|\*\*Тема:\*\*|Регулятор оставил ставку без изменений/);
});

void test('company block combines current and older publications without an empty news section', () => {
  const old = { title: 'Фосагро объявила результаты', text: '', url: 'https://example.com/old', source: 'Издание',
    publishedAt: new Date('2026-10-14T08:00:00Z'), category: 'company' as const, company: 'Фосагро', reason: '' };
  const press = { ...old, title: 'Отчёт Фосагро', url: 'https://example.com/press',
    source: 'Фосагро · Пресс центр компании', companySource: 'Фосагро' };
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], world: [], companies: [],
    companyNews: [{ company: 'Фосагро', ticker: 'PHOR', press: [press], news: [old] }, { company: 'Газпром', ticker: 'GAZP', press: [], news: [] }],
    companyCapitalizations: { PHOR: { valueRub: 732_190_000_000, url: 'https://iss.moex.com/PHOR' } },
    issues: [], checkedSources: 1,
  });
  assert.match(markdown, /### 🏢 Компании в портфеле\n\n_Капитализация относится к выпуску акций/);
  assert.match(markdown, /> \[!invest-company-1479b8\] 🏢 Фосагро · PHOR · 2 новости\n>\n> ```invest-manager-stock\n> PHOR\n> 2026-10-17T06:00:00.000Z\n> ```\n>\n> \*\*Капитализация выпуска:\*\* 732,19 млрд ₽ · \[Мосбиржа, ISS\]\(https:\/\/iss\.moex\.com\/PHOR\)\n>\n> \| Дата \| Публикация \| Источник \|/);
  assert.match(markdown, /Отчёт Фосагро/);
  assert.match(markdown, /Фосагро объявила результаты/);
  assert.match(markdown, /🕘 14 октября, 11:00/);
  assert.match(markdown, /> \[!invest-company\] 🏢 Газпром · GAZP · без публикаций\n>\n> ```invest-manager-stock\n> GAZP\n> 2026-10-17T06:00:00.000Z\n> ```\n>\n> \*\*Капитализация выпуска:\*\* нет данных\n>\n> _Датированных публикаций/);
  assert.match(markdown, /\[Издание\]\(https:\/\/example\.com\/old\)/);
  assert.doesNotMatch(markdown, /### 📰 Пресс центр компании|### 🕘 Последние новости компаний/);
});

void test('older topic news is visibly separated and dated', () => {
  const old = { title: 'Нефть подорожала', text: '', url: 'https://example.com/oil', source: 'Издание',
    publishedAt: new Date('2026-10-14T08:00:00Z'), category: 'world' as const, topic: 'Нефть', reason: '' };
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], world: [], companies: [],
    worldBackfill: [{ topic: 'Нефть', items: [old] }], issues: [], checkedSources: 1,
  });
  assert.match(markdown, /### 🕘 Последние доступные новости по темам · старше 24 часов/);
  assert.match(markdown, /> \[!invest-topic\] 🕘 Нефть · 1 новость\n>\n> - \*\*Нефть подорожала\*\* · 14 октября, 11:00/);
  assert.match(markdown, /Это не новости за указанный выше период/);
});

void test('report places topic notes under the heading and distinct event notes beside stories', () => {
  const story = { title: 'Решение ФРС', text: '', url: 'https://example.com/fed', source: 'Издание',
    publishedAt: new Date('2026-10-17T05:00:00Z'), category: 'world' as const, topic: 'Ключевая ставка', reason: '' };
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], world: [story], companies: [],
    companyNews: [{ company: 'Фосагро', ticker: 'PHOR', press: [], news: [] }],
    relatedNotes: { companies: { PHOR: ['[[Идеи/ФосАгро.md|ФосАгро]]'] },
      topics: { 'Ключевая ставка': ['[[Макро/ДКП.md|ДКП]]'] },
      events: { [`${story.url}\u0000${story.title}`]: [
        '[[Макро/ДКП.md|ДКП]]', '[[История/ФРС.md|История ФРС]]'] } },
    issues: [], checkedSources: 1,
  });
  assert.match(markdown, /> \[!invest-company-1479b8\] 🏢 Фосагро · PHOR[\s\S]*\*\*Мои заметки:\*\* \[\[Идеи\/ФосАгро\.md\|ФосАгро\]\]/);
  assert.match(markdown, /> \[!invest-topic\] 🗞️ Ключевая ставка · 1 новость\n>\n> \*\*Мои заметки:\*\* \[\[Макро\/ДКП\.md\|ДКП\]\]/);
  assert.match(markdown, /\*\*Решение ФРС\*\*[\s\S]*📎 Мои заметки: \[\[История\/ФРС\.md\|История ФРС\]\]/);
  assert.equal((markdown.match(/\[\[Макро\/ДКП\.md/g) ?? []).length, 1);
  assert.equal((markdown.match(/\[\[Идеи\/ФосАгро\.md/g) ?? []).length, 1);
});

void test('world topics become separate cards with counts and news links inside each card', () => {
  const item = (topic: string, title: string, suffix: string) => ({
    title, text: '', url: `https://example.com/${suffix}`, source: 'Издание',
    publishedAt: new Date('2026-10-17T05:00:00Z'), category: 'world' as const, topic, reason: '',
  });
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], companies: [],
    world: [item('США', 'Первая новость', 'first'), item('США', 'Вторая новость', 'second'),
      item('Израиль', 'Третья новость', 'third')], issues: [], checkedSources: 1,
  });
  assert.equal((markdown.match(/> \[!invest-topic\]/g) ?? []).length, 2);
  assert.match(markdown, /> \[!invest-topic\] 🗞️ США · 2 новости\n>\n> - \*\*Первая новость\*\*/);
  assert.match(markdown, /> \[!invest-topic\] 🗞️ Израиль · 1 новость\n>\n> - \*\*Третья новость\*\*/);
  assert.match(markdown, /> - \*\*Вторая новость\*\*[^\n]*\[Издание\]\(https:\/\/example\.com\/second\)/);
});

void test('company publication shows its own related note in the publication row', () => {
  const story = { title: 'Фосагро открыла новый комплекс', text: '', url: 'https://example.com/phor',
    source: 'Пресс-центр', publishedAt: new Date('2026-10-17T05:00:00Z'),
    category: 'company' as const, company: 'Фосагро', reason: '' };
  const markdown = renderDigest({
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], world: [], companies: [story],
    companyNews: [{ company: 'Фосагро', ticker: 'PHOR', press: [story], news: [] }],
    relatedNotes: { companies: { PHOR: [] }, topics: {},
      events: { [`${story.url}\u0000${story.title}`]: ['[[Проекты/Новый комплекс.md|Новый комплекс]]'] } },
    issues: [], checkedSources: 1,
  });
  assert.match(markdown, /Фосагро открыла новый комплекс\*\*<br>📎 Мои заметки: \[\[Проекты\/Новый комплекс\.md\|Новый комплекс\]\]/);
});

void test('company card encodes a safe brand accent and allows a Markdown override', () => {
  const result: DigestResult = {
    windowStart: new Date('2026-10-16T06:00:00Z'), windowEnd: new Date('2026-10-17T06:00:00Z'),
    generatedAt: new Date('2026-10-17T06:05:00Z'), market: [], world: [], companies: [],
    companyNews: [{ company: 'Сбер', ticker: 'SBER', press: [], news: [] }],
    issues: [], checkedSources: 1,
  };
  assert.match(renderDigest(result), /> \[!invest-company-21a038\] 🏢 Сбер · SBER/);
  assert.match(renderDigest(result, [{ name: 'Сбер', ticker: 'SBER', color: '#345abc' }]),
    /> \[!invest-company-345abc\] 🏢 Сбер · SBER/);
});
