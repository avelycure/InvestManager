import assert from 'node:assert/strict';
import test from 'node:test';
import type { App, TFile } from 'obsidian';
import { findRelatedNotes } from '../src/related-notes.ts';
import type { ConfigFiles, SelectedNews } from '../src/types.ts';

const config: ConfigFiles = {
  companies: [{ name: 'Фосагро', ticker: 'PHOR' }],
  topics: [{ name: 'Ключевая ставка', keywords: ['ФРС', 'центробанк'] }],
  channels: [], publications: [],
};

function file(path: string, mtime = 1): TFile {
  const basename = path.split('/').at(-1)!.replace(/\.md$/, '');
  return { path, basename, extension: 'md', stat: { mtime } } as TFile;
}

function app(files: TFile[], aliases: Record<string, string[] | string> = {}, search?: (query: string) => Promise<unknown>): App {
  return {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: (item: TFile) => ({ frontmatter: { aliases: aliases[item.path] } }) },
    fileManager: { generateMarkdownLink: (item: TFile, _source: string, _subpath: string | undefined, label: string) =>
      `[[${item.path}|${label}]]` },
    plugins: search ? { getPlugin: () => ({ search }) } : { getPlugin: () => undefined },
  } as unknown as App;
}

function news(title: string, url: string, topic = 'Международные отношения'): SelectedNews {
  return { title, url, source: 'Источник', text: '', publishedAt: new Date('2026-10-18T06:00:00Z'),
    category: 'world', reason: '', topic };
}

void test('links exact company and topic notes without reading note bodies', async () => {
  const files = [file('Идеи/ФосАгро.md'), file('Портфель/PHOR/Тезис.md', 3),
    file('Макро/ДКП.md'), file('Статистика/2026/октябрь/18 октября.md')];
  const result = await findRelatedNotes(app(files, { 'Макро/ДКП.md': ['Ключевая ставка'] }),
    config, 'Статистика/2026/октябрь/18 октября.md', false);
  assert.deepEqual(result.companies.PHOR, [
    '[[Идеи/ФосАгро.md|ФосАгро]]', '[[Портфель/PHOR/Тезис.md|Тезис]]',
  ]);
  assert.deepEqual(result.topics['Ключевая ставка'], ['[[Макро/ДКП.md|ДКП]]']);
  assert.ok(!JSON.stringify(result).includes('Статистика/2026'));
});

void test('semantic links use the event, including historical context, and reject unrelated notes', async () => {
  const files = [file('История/Война во Вьетнаме.md'), file('Другое/Случайная заметка.md')];
  const search = async (_query: string): Promise<unknown> => ({ results: [
    { score: 0.82, chunk: { text: 'США и Вьетнам во время войны', metadata: { source: 'История/Война во Вьетнаме.md' } } },
    { score: 0.94, chunk: { text: 'Совсем другая тема', metadata: { source: 'Другое/Случайная заметка.md' } } },
    { score: 0.95, chunk: { text: 'Вьетнам', metadata: { source: 'Не существует.md' } } },
  ] });
  const item = news('США и Вьетнам обсудили развитие отношений', 'https://example.com/vietnam');
  const result = await findRelatedNotes(app(files, {}, search), config, 'Статистика/отчёт.md', true, [item]);
  assert.deepEqual(result.events?.[`${item.url}\u0000${item.title}`], ['[[История/Война во Вьетнаме.md|Война во Вьетнаме]]']);
});

void test('each news event keeps extra verified candidates so the report can omit section duplicates', async () => {
  const files = Array.from({ length: 7 }, (_, index) => file(`История/Контекст ${index + 1}.md`));
  const search = async (_query: string): Promise<unknown> => ({ results: [
    ...files.map((item, index) => ({ score: 0.95 - index * 0.01,
      chunk: { text: 'США и Вьетнам', metadata: { source: item.path } } })),
    { score: 0.99, chunk: { text: 'США и Вьетнам', metadata: { source: files[0]!.path } } },
  ] });
  const item = news('США и Вьетнам обсудили развитие отношений', 'https://example.com/five-notes');
  const result = await findRelatedNotes(app(files, {}, search), config, 'Статистика/отчёт.md', true, [item]);
  assert.deepEqual(result.events?.[`${item.url}\u0000${item.title}`], [1, 2, 3, 4, 5, 6, 7]
    .map((number) => `[[История/Контекст ${number}.md|Контекст ${number}]]`));
});

void test('unrelated event does not inherit notes from the same topic', async () => {
  const files = [file('История/Хиросима и Нагасаки.md'), file('Политика/История США.md')];
  const search = async (_query: string): Promise<unknown> => ({ results: [
    { score: 0.93, chunk: { text: 'США и Япония в 1945 году', metadata: { source: 'История/Хиросима и Нагасаки.md' } } },
    { score: 0.94, chunk: { text: 'США и выборы', metadata: { source: 'Политика/История США.md' } } },
  ] });
  const items = [news('США и Япония обсудили торговлю', 'https://example.com/japan'),
    news('Индия и Бразилия подписали соглашение', 'https://example.com/india')];
  const result = await findRelatedNotes(app(files, {}, search), config, 'Статистика/отчёт.md', true, items);
  assert.deepEqual(result.events?.[`${items[0]!.url}\u0000${items[0]!.title}`],
    ['[[История/Хиросима и Нагасаки.md|Хиросима и Нагасаки]]']);
  assert.deepEqual(result.events?.[`${items[1]!.url}\u0000${items[1]!.title}`], []);
});
