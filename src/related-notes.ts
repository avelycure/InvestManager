import type { App, TFile } from 'obsidian';
import { ragPlugin } from './rag-context.ts';
import type { ConfigFiles, RelatedNotes, SelectedNews } from './types';

interface Candidate {
  file: TFile;
  score: number;
}

export const MAX_EVENT_NOTE_LINKS = 5;
const MAX_EVENT_NOTE_CANDIDATES = MAX_EVENT_NOTE_LINKS * 2;

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function compact(value: string): string { return normalized(value).replaceAll(' ', ''); }

function aliases(app: App, file: TFile): string[] {
  const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.aliases;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function eligible(file: TFile): boolean {
  return file.extension === 'md' && !file.path.startsWith('Статистика/');
}

function exactScore(app: App, file: TFile, name: string, ticker = '', matchFolder = true): number {
  const names = [file.basename, ...aliases(app, file)];
  const target = compact(name);
  const code = normalized(ticker);
  if (names.some((candidate) => compact(candidate) === target || normalized(candidate) === code)) return 100;
  if (!matchFolder) return 0;
  const parts = file.path.split('/').slice(0, -1);
  return parts.some((part) => compact(part) === target || normalized(part) === code) ? 75 : 0;
}

// A semantic hit must also share a concrete word with the event. This prevents a
// broad topic (for example, geopolitics) from attaching unrelated vault notes.
const GENERIC_WORDS = new Set([
  'новости', 'сегодня', 'последние', 'новый', 'новая', 'новые', 'после', 'перед',
  'отношения', 'отношений', 'развитие', 'развития', 'война', 'войны', 'конфликт',
  'решение', 'решения', 'соглашение', 'заявил', 'заявила', 'заявили', 'страны',
  'страна', 'правительство', 'президент', 'компания', 'компании', 'рынок',
  'ставка', 'ставки', 'процент', 'процентов', 'сегодняшний', 'между',
  'the', 'and', 'with', 'from', 'after', 'before', 'news', 'latest',
  'relations', 'development', 'war', 'conflict', 'government', 'president',
]);

function eventTerms(item: SelectedNews): string[] {
  const title = [item.titleRu, item.title].filter(Boolean).join(' ');
  return [...new Set(normalized(title).split(' ').filter((part) =>
    (part.length >= 4 || ['сша', 'ес', 'кнр', 'фрс', 'оон'].includes(part))
    && !GENERIC_WORDS.has(part)))];
}

function connectedToEvent(item: SelectedNews, file: TFile, passage: string, score: number): boolean {
  const evidence = ` ${normalized([file.basename, passage].join(' '))} `;
  const matched = eventTerms(item).filter((term) => evidence.includes(` ${term} `));
  if (matched.length >= 2) return true;
  const title = ` ${normalized(file.basename)} `;
  return score >= 0.86 && matched.some((term) => term.length >= 5 && title.includes(` ${term} `));
}

export function eventNoteKey(item: SelectedNews): string {
  return `${item.url}\u0000${item.title}`;
}

export async function findRelatedNotes(app: App, config: ConfigFiles, sourcePath: string,
  useRag: boolean, news: SelectedNews[] = []): Promise<RelatedNotes> {
  const files = app.vault.getMarkdownFiles().filter(eligible);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const link = (file: TFile): string => app.fileManager.generateMarkdownLink(file, sourcePath, undefined,
    file.basename.replace(/[\r\n|]/g, ' ').replaceAll('[', ' ').replaceAll(']', ' ').trim());

  const companies: Record<string, string[]> = {};
  for (const company of config.companies) {
    companies[company.ticker] = files.map((file) => ({ file, score: exactScore(app, file, company.name, company.ticker) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.file.stat.mtime - a.file.stat.mtime
        || a.file.path.localeCompare(b.file.path))
      .slice(0, 2).map(({ file }) => link(file));
  }
  const topics: Record<string, string[]> = {};
  for (const topic of config.topics) {
    topics[topic.name] = files.map((file) => ({ file, score: exactScore(app, file, topic.name, '', false) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.file.stat.mtime - a.file.stat.mtime
        || a.file.path.localeCompare(b.file.path))
      .slice(0, 2).map(({ file }) => link(file));
  }

  const events: Record<string, string[]> = {};
  const plugin = useRag ? ragPlugin(app) : undefined;
  if (plugin) {
    try { await plugin.refreshIndexForSearch?.(); }
    catch { /* Existing index can still serve searches. */ }
    for (const item of news) {
      const key = eventNoteKey(item);
      if (events[key]) continue;
      const query = [item.titleRu || item.title, item.titleRu ? item.title : '', item.company || item.topic || '']
        .filter(Boolean).join(' · ').slice(0, 400);
      try {
        const response = await plugin.search(query);
        const found = new Map<string, Candidate>();
        for (const hit of response.results ?? []) {
          const path = hit.chunk?.metadata?.source;
          const file = path ? byPath.get(path) : undefined;
          const score = hit.score;
          if (!file || typeof score !== 'number' || !Number.isFinite(score) || score < 0.72) continue;
          if (!connectedToEvent(item, file, hit.chunk?.text ?? '', score)) continue;
          const previous = found.get(file.path);
          if (!previous || previous.score < score) found.set(file.path, { file, score });
        }
        events[key] = [...found.values()].sort((a, b) => b.score - a.score
          || b.file.stat.mtime - a.file.stat.mtime || a.file.path.localeCompare(b.file.path))
          .slice(0, MAX_EVENT_NOTE_CANDIDATES).map(({ file }) => link(file));
      } catch {
        events[key] = [];
      }
    }
  }
  return { companies, topics, events };
}
