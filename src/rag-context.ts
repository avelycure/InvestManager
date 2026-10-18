import type { App } from 'obsidian';
import type { ConfigFiles, InvestSettings } from './types';

interface RagHit {
  chunk?: { text?: string; metadata?: { source?: string; title?: string; file_mtime?: number } };
  score?: number;
}

export interface RagPlugin {
  search(query: string): Promise<{ results?: RagHit[] }>;
  refreshIndexForSearch?: () => Promise<void>;
}

interface PluginRegistry {
  getPlugin?: (id: string) => unknown;
  plugins?: Record<string, unknown>;
}

export interface RagContext {
  text: string;
  issue?: string;
}

export function ragPlugin(app: App): RagPlugin | undefined {
  const registry = (app as App & { plugins?: PluginRegistry }).plugins;
  const candidate = registry?.getPlugin?.('ai-advent-rag') ?? registry?.plugins?.['ai-advent-rag'];
  if (candidate && typeof (candidate as RagPlugin).search === 'function') return candidate as RagPlugin;
  return undefined;
}

export async function projectRagContext(app: App, config: ConfigFiles, settings: InvestSettings): Promise<RagContext> {
  if (!settings.ragEnabled) return { text: '' };
  if (settings.llmProvider === 'cloud' && !settings.allowCloudVaultContext) {
    return { text: '', issue: 'Включите отдельное разрешение на передачу фрагментов заметок облачной модели' };
  }
  const plugin = ragPlugin(app);
  if (!plugin) return { text: '', issue: 'Плагин AskMyMind не включён или не предоставляет поиск' };

  const queries = [
    config.companies.map((company) => `${company.name} ${company.ticker}`).join(', '),
    config.topics.map((topic) => topic.name).join(', '),
  ].filter(Boolean);
  if (!queries.length) return { text: '' };

  try {
    await plugin.refreshIndexForSearch?.();
    const seen = new Set<string>();
    const snippets: string[] = [];
    for (const query of queries) {
      const response = await plugin.search(query.slice(0, 800));
      for (const result of response.results ?? []) {
        const metadata = result.chunk?.metadata;
        const source = metadata?.source?.trim();
        const content = result.chunk?.text?.trim();
        if (!source || !content) continue;
        const key = `${source}:${content.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const mtime = metadata?.file_mtime;
        const date = typeof mtime === 'number' && Number.isFinite(mtime) && mtime >= 0 && mtime <= 8.64e15
          ? new Date(mtime).toISOString().slice(0, 10) : 'дата неизвестна';
        snippets.push(`[${source}; изменено ${date}] ${content.slice(0, 600)}`);
        if (snippets.length >= 6) break;
      }
      if (snippets.length >= 6) break;
    }
    return { text: snippets.join('\n\n').slice(0, 4_000),
      issue: snippets.length ? undefined : 'Индекс AskMyMind не нашёл подходящих заметок' };
  } catch (error) {
    return { text: '', issue: `Поиск AskMyMind не удался: ${error instanceof Error ? error.message : String(error)}` };
  }
}
