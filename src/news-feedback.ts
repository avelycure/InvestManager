import { App, FileSystemAdapter } from 'obsidian';
import { assertNoSymlink } from './report-guard';
import { REPORT_ROOT } from './report-path';
import type { NewsFeedback, NewsRating, SelectedNews } from './types';

export const FEEDBACK_PATH = `${REPORT_ROOT}/.invest-manager/news-feedback.json`;
const RATINGS: NewsRating[] = ['helpful', 'off-topic', 'not-interesting'];

export class NewsFeedbackStore {
  private pending: Promise<void> = Promise.resolve();
  constructor(private app: App) {}

  private adapter(): FileSystemAdapter {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) throw new Error('Для оценок требуется локальное хранилище');
    return this.app.vault.adapter;
  }

  async load(): Promise<NewsFeedback[]> {
    const adapter = this.adapter();
    await assertNoSymlink(adapter.getBasePath(), FEEDBACK_PATH);
    if (!(await adapter.exists(FEEDBACK_PATH))) return [];
    const content = await adapter.read(FEEDBACK_PATH);
    if (content.length > 2_000_000) throw new Error('Файл оценок новостей слишком велик');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error('Файл оценок новостей повреждён');
    return (parsed as unknown[]).filter((value): value is NewsFeedback => {
      if (!value || typeof value !== 'object') return false;
      const entry = value as Record<string, unknown>;
      return typeof entry.url === 'string' && /^https?:\/\//.test(entry.url)
        && typeof entry.title === 'string' && typeof entry.source === 'string'
        && (entry.topic === undefined || typeof entry.topic === 'string')
        && (entry.rating === undefined || (RATINGS.includes(entry.rating as NewsRating) && typeof entry.ratedAt === 'string'))
        && (entry.readAt === undefined || typeof entry.readAt === 'string')
        && (entry.rating !== undefined || entry.readAt !== undefined);
    });
  }

  record(news: SelectedNews, rating: NewsRating): Promise<NewsFeedback[]> {
    if (!RATINGS.includes(rating)) return Promise.reject(new Error('Неизвестная оценка'));
    const work = this.pending.then(async () => {
      const adapter = this.adapter();
      const base = adapter.getBasePath();
      await assertNoSymlink(base, FEEDBACK_PATH);
      for (const path of [REPORT_ROOT, `${REPORT_ROOT}/.invest-manager`]) {
        if (!(await adapter.exists(path))) await adapter.mkdir(path);
      }
      const existing = await this.load();
      const readAt = existing.find((item) => item.url === news.url && item.readAt)?.readAt;
      const entry: NewsFeedback = { url: news.url, title: news.title.slice(0, 300), source: news.source.slice(0, 120),
        topic: news.topic, rating, ratedAt: new Date().toISOString(), readAt };
      const updated = [...existing.filter((item) => item.url !== entry.url || item.topic !== entry.topic), entry].slice(-3000);
      await assertNoSymlink(base, FEEDBACK_PATH);
      await adapter.write(FEEDBACK_PATH, `${JSON.stringify(updated, null, 2)}\n`);
      return updated;
    });
    this.pending = work.then(() => undefined, () => undefined);
    return work;
  }

  markRead(news: SelectedNews): Promise<NewsFeedback[]> {
    const work = this.pending.then(async () => {
      const adapter = this.adapter();
      const base = adapter.getBasePath();
      await assertNoSymlink(base, FEEDBACK_PATH);
      for (const path of [REPORT_ROOT, `${REPORT_ROOT}/.invest-manager`]) {
        if (!(await adapter.exists(path))) await adapter.mkdir(path);
      }
      const existing = await this.load();
      const readAt = new Date().toISOString();
      const updated = existing.some((item) => item.url === news.url)
        ? existing.map((item) => item.url === news.url ? { ...item, readAt } : item)
        : [...existing, { url: news.url, title: news.title.slice(0, 300), source: news.source.slice(0, 120),
          topic: news.topic, readAt }];
      await assertNoSymlink(base, FEEDBACK_PATH);
      await adapter.write(FEEDBACK_PATH, `${JSON.stringify(updated.slice(-3000), null, 2)}\n`);
      return updated.slice(-3000);
    });
    this.pending = work.then(() => undefined, () => undefined);
    return work;
  }
}
