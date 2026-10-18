import { App, TFile } from 'obsidian';
import { parseConfigRows } from './markdown-config';
import { parseTopics } from './topic-config';
import { publicSourceUrl } from './public-source-url';
import type { Channel, Company, ConfigFiles, InvestSettings, Publication } from './types';

function validateUrl(url: string, path: string, line: number): void {
  if (!publicSourceUrl(url)) {
    throw new Error(`${path}:${line}: некорректный адрес «${url}»`);
  }
}

function unique<T>(items: T[], getKey: (item: T) => string, path: string): T[] {
  const keys = new Set<string>();
  for (const item of items) {
    const key = getKey(item).toLowerCase();
    if (keys.has(key)) throw new Error(`${path}: повторяется «${key}»`);
    keys.add(key);
  }
  return items;
}

function parseCompanies(content: string, path: string): Company[] {
  const items = parseConfigRows(content, path, ['Название', 'Тикер']).map(({ line, cells }) => {
    const ticker = cells['Тикер']?.toUpperCase() ?? '';
    if (!/^[A-Z0-9_.-]+$/.test(ticker)) throw new Error(`${path}:${line}: некорректный тикер`);
    if (cells['Инвесторам']) validateUrl(cells['Инвесторам'], path, line);
    const news = cells['Пресс центр компании'] || cells['Пресс-центр компании'];
    if (news) validateUrl(news, path, line);
    return { name: cells['Название'] ?? '', ticker, investors: cells['Инвесторам'] || undefined, news: news || undefined };
  });
  return unique(items, (item) => item.ticker, path);
}

function parseChannels(content: string, path: string): Channel[] {
  const items = parseConfigRows(content, path, ['Название', 'Канал'], 'Канал').map(({ line, cells }) => {
    const raw = cells['Канал'] ?? '';
    const match = raw.match(/^(?:@|https:\/\/t\.me\/)([A-Za-z0-9_]{5,32})\/?$/);
    if (!match?.[1]) throw new Error(`${path}:${line}: нужен публичный @username или https://t.me/username`);
    return { name: cells['Название'] || `@${match[1]}`, username: `@${match[1]}` };
  });
  return unique(items, (item) => item.username, path);
}

export async function loadChannels(app: App, settings: Pick<InvestSettings, 'channelsPath'>): Promise<Channel[]> {
  const content = await readFile(app, settings.channelsPath, 'Telegram-каналы');
  return parseChannels(content, settings.channelsPath);
}

export async function loadCompanies(app: App, settings: Pick<InvestSettings, 'companiesPath'>): Promise<Company[]> {
  const content = await readFile(app, settings.companiesPath, 'Компании');
  return parseCompanies(content, settings.companiesPath);
}

function parsePublications(content: string, path: string): Publication[] {
  const items = parseConfigRows(content, path, ['Название']).map(({ line, cells }) => {
    const url = cells['RSS-лента'] || cells['Адрес'] || '';
    if (!url) throw new Error(`${path}:${line}: пустое поле «RSS-лента»`);
    validateUrl(url, path, line);
    return { name: cells['Название'] ?? '', url };
  });
  return unique(items, (item) => item.url, path);
}

async function readFile(app: App, path: string, label: string): Promise<string> {
  if (!path.trim()) throw new Error(`Не указан файл «${label}» в настройках`);
  const file = app.vault.getAbstractFileByPath(path.trim());
  if (!(file instanceof TFile) || file.extension !== 'md') throw new Error(`Файл «${label}» не найден: ${path}`);
  return app.vault.cachedRead(file);
}

export async function loadConfig(app: App, settings: InvestSettings): Promise<ConfigFiles> {
  const [companies, topics, channels, publications] = await Promise.all([
    readFile(app, settings.companiesPath, 'Компании'),
    readFile(app, settings.topicsPath, 'Темы'),
    readFile(app, settings.channelsPath, 'Telegram-каналы'),
    readFile(app, settings.publicationsPath, 'Издания'),
  ]);
  return {
    companies: parseCompanies(companies, settings.companiesPath),
    topics: parseTopics(topics, settings.topicsPath),
    channels: parseChannels(channels, settings.channelsPath),
    publications: parsePublications(publications, settings.publicationsPath),
  };
}
