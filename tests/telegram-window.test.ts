import assert from 'node:assert/strict';
import test from 'node:test';
import { telegramWindow, type TelegramMessage } from '../src/telegram-window.ts';

async function* history(posts: TelegramMessage[]): AsyncGenerator<TelegramMessage> {
  for (const post of posts) yield post;
}

void test('MTProto history includes both 24-hour boundaries and stops at older posts', async () => {
  const start = new Date('2026-10-16T06:00:00Z');
  const end = new Date('2026-10-17T06:00:00Z');
  const second = (value: string): number => Date.parse(value) / 1000;
  const result = await telegramWindow(history([
    { id: 5, date: second('2026-10-17T06:00:01Z'), message: 'Позже периода' },
    { id: 4, date: second('2026-10-17T06:00:00Z'), message: 'Конец' },
    { id: 3, date: second('2026-10-16T06:00:00Z'), message: 'Начало' },
    { id: 2, date: second('2026-10-16T05:59:59Z'), message: 'Старше периода' },
    { id: 1, date: second('2026-10-16T05:00:00Z'), message: 'Не должен читаться' },
  ]), { name: 'Канал', username: '@marketnews' }, 'marketnews', start, end);
  assert.deepEqual(result.items.map((item) => item.title), ['Конец', 'Начало']);
  assert.equal(result.items[0]?.url, 'https://t.me/marketnews/4');
  assert.equal(result.truncated, false);
});

void test('MTProto history reports incomplete coverage when the page cap is reached', async () => {
  const result = await telegramWindow(history([
    { id: 3, date: 3, message: 'Три' },
    { id: 2, date: 2, message: 'Два' },
    { id: 1, date: 1, message: 'Один' },
  ]), { name: 'Канал', username: '@marketnews' }, 'marketnews', new Date(0), new Date(5000), 2);
  assert.equal(result.truncated, true);
});
