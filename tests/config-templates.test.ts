import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTemplatePaths, CONFIG_TEMPLATES } from '../src/config-templates.ts';
import { REPORT_ROOT } from '../src/report-path.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { parseConfigRows } from '../src/markdown-config.ts';

void test('all four starter files stay in Statistics and set their input paths', () => {
  const settings = { ...DEFAULT_SETTINGS };
  applyTemplatePaths(settings);
  assert.equal(CONFIG_TEMPLATES.length, 4);
  assert.equal(new Set(CONFIG_TEMPLATES.map((item) => item.path)).size, 4);
  for (const template of CONFIG_TEMPLATES) {
    assert.equal(template.path.startsWith(`${REPORT_ROOT}/`), true);
    assert.equal(settings[template.key], template.path);
    assert.ok(template.markdown.trim());
  }
});

void test('publication starter file labels direct feed URLs', () => {
  const template = CONFIG_TEMPLATES.find((item) => item.key === 'publicationsPath');
  assert.ok(template);
  const rows = parseConfigRows(template.markdown, template.path, ['Название', 'RSS-лента']);
  assert.equal(rows[0]?.cells['RSS-лента'], 'https://example.com/feed');
});

void test('company starter file has a separate press center column', () => {
  const template = CONFIG_TEMPLATES.find((item) => item.key === 'companiesPath');
  assert.ok(template);
  const rows = parseConfigRows(template.markdown, template.path, ['Название', 'Тикер']);
  assert.equal(rows[0]?.cells['Пресс центр компании'], 'https://example.com/news');
  assert.equal(rows[0]?.cells['Цвет'], '#21A038');
});
