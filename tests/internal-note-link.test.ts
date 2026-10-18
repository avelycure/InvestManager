import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { internalNoteLink } from '../src/internal-note-link.ts';

void test('custom report opens internal note links from their rendered data-href', () => {
  const { document } = parseHTML('<div id="report"><a class="internal-link" data-href="Идеи/ФосАгро" href="Идеи/ФосАгро.md"><span>ФосАгро</span></a></div>');
  const root = document.querySelector<HTMLElement>('#report')!;
  const nested = root.querySelector('span')!;
  assert.equal(internalNoteLink(nested, root), 'Идеи/ФосАгро');
});

void test('external and out-of-report links are left to their normal handlers', () => {
  const { document } = parseHTML('<div id="report"><a href="https://example.com">Издание</a><a class="internal-link" data-href="https://example.com">Опасная ссылка</a></div><a class="internal-link" data-href="Другое">Вне отчёта</a>');
  const root = document.querySelector<HTMLElement>('#report')!;
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a');
  assert.equal(internalNoteLink(anchors[0]!, root), undefined);
  assert.equal(internalNoteLink(anchors[1]!, root), undefined);
  assert.equal(internalNoteLink(anchors[2]!, root), undefined);
});
