import { REPORT_ROOT } from './report-path.ts';
import type { InvestSettings } from './types';

export type ConfigPathKey = 'companiesPath' | 'topicsPath' | 'channelsPath' | 'publicationsPath';

export interface ConfigTemplate {
  key: ConfigPathKey;
  title: string;
  description: string;
  path: string;
  markdown: string;
}

export const CONFIG_TEMPLATES: readonly ConfigTemplate[] = [
  {
    key: 'companiesPath',
    title: 'Компании портфеля',
    description: 'Название и тикер Московской биржи обязательны. Необязательный «Цвет» задаёт акцент карточки в формате #RRGGBB. «Инвесторам» пока не используется; «Пресс центр компании» — ссылка на страницу новостей компании или её RSS/Atom-ленту.',
    path: `${REPORT_ROOT}/Компании в портфеле.md`,
    markdown: '| Название | Тикер | Цвет | Инвесторам | Пресс центр компании |\n| --- | --- | --- | --- | --- |\n| Название компании | TICKER | #21A038 | https://example.com/investors | https://example.com/news |',
  },
  {
    key: 'topicsPath',
    title: 'Темы новостей',
    description: 'Темы можно задать списком. Для поиска в иностранных изданиях используйте таблицу с английскими вариантами; слова и фразы разделяйте точкой с запятой.',
    path: `${REPORT_ROOT}/Темы новостей.md`,
    markdown: '| Тема | Ключевые слова | Английские варианты |\n| --- | --- | --- |\n| Инфляция | инфляции; потребительские цены | inflation; consumer price index; CPI |\n| Ключевая ставка | ключевой ставки; ставка ЦБ | interest rate; policy rate; key rate |',
  },
  {
    key: 'channelsPath',
    title: 'Telegram-каналы',
    description: 'В списке укажите публичные @username. Для собственных названий можно использовать таблицу.',
    path: `${REPORT_ROOT}/Telegram каналы.md`,
    markdown: '1. @example_channel',
  },
  {
    key: 'publicationsPath',
    title: 'RSS-ленты изданий',
    description: 'Укажите прямой адрес RSS/Atom-ленты каждого издания, а не адрес его главной страницы.',
    path: `${REPORT_ROOT}/Издания.md`,
    markdown: '| Название | RSS-лента |\n| --- | --- |\n| Название издания | https://example.com/feed |',
  },
];

export function applyTemplatePaths(settings: InvestSettings): void {
  for (const template of CONFIG_TEMPLATES) settings[template.key] = template.path;
}
