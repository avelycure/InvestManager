import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildHelpContext, buildHelpRequest, helpOverview, parseHelpCommand } from '../src/help.ts';

void test('/help accepts an optional question and rejects other commands', () => {
  assert.deepEqual(parseHelpCommand(' /help '), { question: '' });
  assert.deepEqual(parseHelpCommand('/help как подключить Telegram?'), { question: 'как подключить Telegram?' });
  assert.equal(parseHelpCommand('/helpful'), undefined);
  assert.equal(parseHelpCommand('/report'), undefined);
});

void test('follow-up help keeps recent questions without growing without bound', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ question: `Вопрос ${index}`, answer: `Ответ ${index}` }));
  const request = buildHelpRequest('А где это настроить?', history, [{ name: 'README.md', content: 'Настройки Telegram' }]);
  assert.doesNotMatch(request, /Вопрос 0|Вопрос 1/);
  assert.match(request, /Вопрос 2/);
  assert.match(request, /Ответ 5/);
  assert.match(request, /Текущий вопрос: А где это настроить\?/);
});

void test('help answers can use bundled project documentation without reading the vault', () => {
  const documents = [
    { name: 'README.md', content: readFileSync('README.md', 'utf8') },
    { name: 'docs/specification.md', content: readFileSync('docs/specification.md', 'utf8') },
    { name: 'docs/config-formats.md', content: readFileSync('docs/config-formats.md', 'utf8') },
    { name: 'docs/architecture.md', content: readFileSync('docs/architecture.md', 'utf8') },
    { name: 'docs/code-review-baseline.md', content: readFileSync('docs/code-review-baseline.md', 'utf8') },
  ];
  const context = buildHelpContext('Как добавить Telegram канал?', documents);
  assert.match(context, /\[README\.md\]/);
  assert.match(context, /docs\/config-formats\.md · Публичные Telegram-каналы/);
  assert.ok(context.length <= 30_000);
  assert.match(helpOverview(), /Сформировать сводку/);
  const structure = buildHelpContext('Как устроена структура проекта и где собираются новости?', documents);
  assert.match(structure, /docs\/architecture\.md · Структура проекта/);
  assert.match(structure, /src\/news\.ts/);
});
