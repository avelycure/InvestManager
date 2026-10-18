import type { SelectedNews } from './types';

export function needsRussianTranslation(text: string): boolean {
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  const cyrillic = (text.match(/[а-яё]/gi) ?? []).length;
  return latin >= 12 && latin > cyrillic * 2;
}

export function russianModelText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  return /[а-яё]/i.test(text) && !needsRussianTranslation(text) ? text.slice(0, limit) : '';
}

export function finishNewsLanguage(items: SelectedNews[]): { items: SelectedNews[]; untranslated: number } {
  let untranslated = 0;
  return {
    items: items.map((item) => {
      if (needsRussianTranslation(item.title) && !item.titleRu) {
        untranslated++;
        return { ...item, summary: undefined };
      }
      return item;
    }),
    untranslated,
  };
}
