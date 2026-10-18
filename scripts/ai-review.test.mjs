import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateFiles, compactDiff, createEmbeddings, publishReview, retrieveContext,
  retrieveEmbeddedContext, reviewPrompt } from './ai-review.mjs';

test('retrieval includes related documentation and code, but ignores generated files', () => {
  const files = ['README.md', 'docs/architecture.md', 'src/report.ts', 'src/news.ts', 'package-lock.json', 'main.js'];
  const body = new Map([
    ['README.md', 'The report is saved to Statistics only.'],
    ['docs/architecture.md', 'The report guard checks output paths.'],
    ['src/report.ts', 'export function saveReport() { return reportGuard(); }'],
    ['src/news.ts', 'export function collectNews() { return []; }'],
  ]);
  const context = retrieveContext(files, ['src/report.ts'], '+ saveReport report guard Statistics',
    (path) => body.get(path), 5_000);
  assert.match(context, /README\.md|docs\/architecture\.md/);
  assert.match(context, /src\/report\.ts/);
  assert.doesNotMatch(context, /package-lock\.json|main\.js/);
  assert.deepEqual(candidateFiles(files).includes('package-lock.json'), false);
});

test('review prompt bounds large diffs and still lists every changed file', () => {
  const diff = `diff --git a/one.ts b/one.ts\n${'+ change\n'.repeat(10_000)}`;
  const prompt = reviewPrompt(['one.ts', 'two.ts'], diff, '### README.md:1\nArchitecture');
  assert.match(prompt, /one\.ts\ntwo\.ts/);
  assert.match(prompt, /README\.md:1/);
  assert.match(compactDiff(diff, 2_000), /diff опущена/);
  assert.ok(prompt.length < 32_000);
});

test('embedding retrieval finds semantically related docs without shared words', async () => {
  const files = ['README.md', 'docs/security.md', 'src/report.ts'];
  const body = new Map([
    ['README.md', 'The plugin creates a daily note.'],
    ['docs/security.md', 'Only statistics folder is writable.'],
    ['src/report.ts', 'export function saveReport() { return true; }'],
  ]);
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const { input } = JSON.parse(options.body);
    requests.push(input);
    return new Response(JSON.stringify({ data: input.map((text, index) => ({ index,
      embedding: text.includes('+ guard') || text.includes('docs/security.md') ? [1, 0] : text.includes('README.md') ? [0, 1]
        : text.includes('src/report.ts') ? [0, 1] : [1, 0],
    })).reverse() }), { status: 200 });
  };
  const context = await retrieveEmbeddedContext(files, ['src/report.ts'], '+ guard output path',
    (path) => body.get(path), { apiKey: 'fake', baseUrl: 'https://example.com/v1', model: 'embed-test', fetchImpl }, 5_000);
  assert.match(context, /docs\/security\.md:1/);
  assert.doesNotMatch(context, /README\.md:1/);
  assert.match(context, /src\/report\.ts:1/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].length, 4);
});

test('embedding response validation rejects missing or malformed vectors', async () => {
  await assert.rejects(createEmbeddings(['query'], 'fake', 'https://example.com/v1', 'embed-test',
    async () => new Response(JSON.stringify({ data: [] }), { status: 200 })), /Некорректный ответ/);
  await assert.rejects(createEmbeddings(['query'], 'fake', 'https://example.com/v1', 'embed-test',
    async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [NaN] }] }), { status: 200 })),
  /Некорректный вектор/);
});

test('a rerun updates the bot comment and rejects a stale PR head', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), method: options.method });
    const value = String(url).includes('/pulls/7') ? { head: { sha: 'current' } }
      : String(url).includes('/issues/7/comments') ? [{ id: 42, user: { login: 'github-actions[bot]' },
        body: '<!-- invest-manager-ai-review -->' }]
        : { html_url: 'https://github.com/example/repo/pull/7#issuecomment-42' };
    return new Response(JSON.stringify(value), { status: 200 });
  };
  try {
    const url = await publishReview('example/repo', 7, 'current', 'fake-token', 'Проверено');
    assert.match(url, /issuecomment-42/);
    assert.equal(requests.at(-1)?.method, 'PATCH');
    const before = requests.length;
    await assert.rejects(publishReview('example/repo', 7, 'old', 'fake-token', 'Старое'), /PR обновился/);
    assert.equal(requests.length, before + 1);
  } finally { globalThis.fetch = originalFetch; }
});
