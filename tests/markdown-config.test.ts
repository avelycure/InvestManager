import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfigRows } from '../src/markdown-config.ts';

void test('accepts numbered Markdown lists for one-field configuration', () => {
  const rows = parseConfigRows('1. Нефть\n2. Ставка\n', 'Темы.md', ['Тема'], 'Тема');
  assert.deepEqual(rows.map((row) => row.cells['Тема']), ['Нефть', 'Ставка']);
});

void test('reports missing structured fields for company list', () => {
  assert.throws(
    () => parseConfigRows('1. [[Фосагро]]', 'Компании.md', ['Название', 'Тикер']),
    /Компании\.md:1: найден список.*Название.*Тикер/,
  );
});

void test('accepts regular Markdown table with title and separator', () => {
  const rows = parseConfigRows('# Компании\n| Название | Тикер |\n| --- | --- |\n| Фосагро | PHOR |', 'Компании.md', ['Название', 'Тикер']);
  assert.equal(rows[0]?.cells['Тикер'], 'PHOR');
});
