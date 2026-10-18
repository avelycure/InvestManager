import type { Channel, NewsItem } from './types';

export interface TelegramMessage {
  id: number;
  date: number;
  message?: string;
}

export interface TelegramWindowResult { items: NewsItem[]; truncated: boolean }

/** Telegram history is ordered newest first; stop when the 24-hour start is reached. */
export async function telegramWindow(
  messages: AsyncIterable<TelegramMessage>, channel: Channel, username: string,
  start: Date, end: Date, limit = 1000,
): Promise<TelegramWindowResult> {
  const items: NewsItem[] = [];
  let inspected = 0;
  let reachedStart = false;
  for await (const post of messages) {
    inspected++;
    const publishedAt = new Date(post.date * 1000);
    if (publishedAt < start) { reachedStart = true; break; }
    if (inspected > limit) break;
    if (publishedAt > end || !post.message) continue;
    const text = post.message.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const title = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    items.push({ title, text, url: `https://t.me/${username}/${post.id}`, source: channel.name, publishedAt, channel: true });
  }
  return { items, truncated: !reachedStart && inspected > limit };
}
