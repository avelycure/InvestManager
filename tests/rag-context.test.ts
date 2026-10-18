import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import { projectRagContext } from '../src/rag-context.ts';
import { DEFAULT_SETTINGS, type ConfigFiles } from '../src/types.ts';

const config: ConfigFiles = {
  companies: [{ name: 'Сбер', ticker: 'SBER' }],
  topics: [{ name: 'Ключевая ставка', keywords: ['ставка'] }],
  channels: [], publications: [],
};

function mockApp(search: (query: string) => Promise<unknown>): App {
  return { plugins: { getPlugin: () => ({ search }) } } as unknown as App;
}

void test('RAG never reads the index while disabled or without cloud consent', async () => {
  let calls = 0;
  const app = mockApp(async () => { calls++; return { results: [] }; });
  const disabled = await projectRagContext(app, config, { ...DEFAULT_SETTINGS, llmProvider: 'cloud' });
  assert.equal(disabled.text, '');
  const denied = await projectRagContext(app, config,
    { ...DEFAULT_SETTINGS, llmProvider: 'cloud', ragEnabled: true });
  assert.equal(denied.text, '');
  assert.match(denied.issue ?? '', /разрешение/);
  assert.equal(calls, 0);
});

void test('local RAG uses the shared search index and bounds private context', async () => {
  const app = mockApp(async () => ({ results: [{ chunk: {
    text: 'Инвестиционный тезис '.repeat(100),
    metadata: { source: 'Идеи/Сбер.md', file_mtime: Date.UTC(2026, 9, 18) },
  } }] }));
  const result = await projectRagContext(app, config,
    { ...DEFAULT_SETTINGS, ragEnabled: true, llmProvider: 'local' });
  assert.match(result.text, /Идеи\/Сбер.md/);
  assert.ok(result.text.length <= 4_000);
});

void test('cloud RAG requires both switches before retrieving notes', async () => {
  let calls = 0;
  const app = mockApp(async () => { calls++; return { results: [{ chunk: {
    text: 'Тезис', metadata: { source: 'Идеи/Сбер.md' },
  } }] }; });
  const result = await projectRagContext(app, config,
    { ...DEFAULT_SETTINGS, ragEnabled: true, llmProvider: 'cloud', allowCloudVaultContext: true });
  assert.equal(calls, 2);
  assert.match(result.text, /Тезис/);
});
