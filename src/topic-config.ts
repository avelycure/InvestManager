import { parseConfigRows } from './markdown-config.ts';
import type { Topic } from './types';

export function parseTopics(content: string, path: string): Topic[] {
  const topics = parseConfigRows(content, path, ['Тема'], 'Тема').map(({ cells }) => ({
    name: cells['Тема'] ?? '',
    keywords: [cells['Ключевые слова'], cells['Английские варианты']]
      .flatMap((value) => (value ?? '').split(';'))
      .map((word) => word.trim()).filter(Boolean),
  }));
  const seen = new Set<string>();
  for (const topic of topics) {
    const key = topic.name.toLocaleLowerCase('ru-RU');
    if (seen.has(key)) throw new Error(`${path}: повторяется «${key}»`);
    seen.add(key);
  }
  return topics;
}
