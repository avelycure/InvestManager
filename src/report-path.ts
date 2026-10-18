import { moscowDateKey } from './time.ts';

export const REPORT_ROOT = 'Статистика';

const MONTHS = [
  ['январь', 'января'], ['февраль', 'февраля'], ['март', 'марта'],
  ['апрель', 'апреля'], ['май', 'мая'], ['июнь', 'июня'],
  ['июль', 'июля'], ['август', 'августа'], ['сентябрь', 'сентября'],
  ['октябрь', 'октября'], ['ноябрь', 'ноября'], ['декабрь', 'декабря'],
] as const;

export function reportPath(date: Date): string {
  const [year = '', month = '', day = ''] = moscowDateKey(date).split('-');
  const names = MONTHS[Number(month) - 1];
  if (!names) throw new Error('Не удалось определить месяц отчёта');
  return `${REPORT_ROOT}/${year}/${names[0]}/${Number(day)} ${names[1]}.md`;
}

export function legacyReportPath(date: Date): string {
  const day = moscowDateKey(date);
  const [year = '', month = ''] = day.split('-');
  return `${REPORT_ROOT}/${year}/${month}/${day}.md`;
}
