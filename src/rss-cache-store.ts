import { App, FileSystemAdapter } from 'obsidian';
import { assertNoSymlink } from './report-guard';
import { REPORT_ROOT } from './report-path';
import { cachedWindow, recordFeeds, type RssCacheState } from './rss-cache';
import type { NewsCollection } from './news';
import type { Publication } from './types';

const CACHE_FOLDER = `${REPORT_ROOT}/.invest-manager`;
const CACHE_PATH = `${CACHE_FOLDER}/rss-cache.json`;
const MAX_CACHE_BYTES = 30_000_000;

export class RssCacheStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private app: App) {}

  private adapter(): FileSystemAdapter {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) throw new Error('Кэш RSS требует локальное хранилище Obsidian');
    return this.app.vault.adapter;
  }

  private async read(): Promise<RssCacheState> {
    const adapter = this.adapter();
    await assertNoSymlink(adapter.getBasePath(), CACHE_PATH);
    if (!(await adapter.exists(CACHE_PATH))) return { version: 1, articles: [], feeds: {} };
    const content = await adapter.read(CACHE_PATH);
    if (content.length > MAX_CACHE_BYTES) throw new Error('Кэш RSS слишком велик');
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || (parsed as RssCacheState).version !== 1
      || !Array.isArray((parsed as RssCacheState).articles) || typeof (parsed as RssCacheState).feeds !== 'object') {
      throw new Error('Некорректный формат кэша RSS');
    }
    return parsed as RssCacheState;
  }

  async update(publications: Publication[], news: NewsCollection, now = new Date()): Promise<void> {
    const work = async (): Promise<void> => {
      const adapter = this.adapter();
      await assertNoSymlink(adapter.getBasePath(), CACHE_PATH);
      if (!(await adapter.exists(REPORT_ROOT))) await adapter.mkdir(REPORT_ROOT);
      if (!(await adapter.exists(CACHE_FOLDER))) await adapter.mkdir(CACHE_FOLDER);
      await assertNoSymlink(adapter.getBasePath(), CACHE_PATH);
      const current = await this.read();
      const next = recordFeeds(current, publications, news.feeds ?? [], [...news.items, ...(news.historyItems ?? [])], now);
      await adapter.write(CACHE_PATH, JSON.stringify(next));
    };
    const result = this.pending.then(work);
    this.pending = result.catch(() => undefined);
    return result;
  }

  async window(publications: Publication[], start: Date, end: Date): Promise<ReturnType<typeof cachedWindow>> {
    await this.pending;
    return cachedWindow(await this.read(), publications, start, end);
  }
}
