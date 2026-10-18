import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type { Channel, Company, InvestSettings, NewsItem, Publication, SourceIssue } from './types';
import type { MtprotoChannelResult } from './telegram-mtproto';
import { runTasks, sourceConcurrency } from './task-runner';
import { parseCompanyNewsPage } from './company-news';
import { isHtmlFeedResponse } from './feed-response';
import { sixMonthsBefore } from './time';
import { publicSourceUrl } from './public-source-url';

export interface NewsCollection {
	items: NewsItem[];
	historyItems?: NewsItem[];
	issues: SourceIssue[];
	checkedSources: number;
	feeds?: FeedObservation[];
}

export interface FeedObservation {
	url: string;
	source: string;
	fetchedAt: string;
	oldestPublishedAt?: string;
	entryCount: number;
	undatedCount: number;
	hasNextPage: boolean;
}

const MAX_FEED_BYTES = 12_000_000;
const SOURCE_TIMEOUT_MS = 25_000;

interface FeedResult {
	items: NewsItem[];
	historyItems?: NewsItem[];
	issue?: string;
	feed?: Omit<FeedObservation, 'fetchedAt'>;
}

function publicationFailure(error: unknown): string {
	const known = ['Лента содержит некорректный XML', 'Пустая лента', 'Адрес не содержит ленту RSS или Atom',
		'Лента слишком велика', 'Страница слишком велика', 'Источник не ответил за 25 секунд'];
	if (!(error instanceof Error)) return 'Сбой запроса; источник не сообщил причину';
	if (known.includes(error.message) || /^Источник вернул HTTP \d{3}$/.test(error.message) || /^Источник вернул HTML вместо RSS/.test(error.message)) return error.message;
	const status = (error as Error & { status?: unknown }).status;
	if (typeof status === 'number' && status >= 400 && status <= 599) return `Источник вернул HTTP ${status}`;
	const code = error.message.match(/\b(?:ERR_[A-Z_]+|E(?:TIMEDOUT|CONNRESET|CONNREFUSED|HOSTUNREACH|AI_AGAIN|NOTFOUND))\b/);
	if (code) return `Сетевая ошибка ${code[0]}`;
	return 'Сбой запроса или ограничение доступа; точная причина не определена';
}

const FEED_HEADERS = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
	'User-Agent': 'Mozilla/5.0 (compatible; ObsidianInvestManager/0.1; +https://obsidian.md)' };

function parseFeedWithHistory(xml: string, publication: Publication, start: Date, end: Date): FeedResult {
	const available = parseFeed(xml, publication, sixMonthsBefore(end), end);
	return { ...available,
		items: available.items.filter((item) => item.publishedAt >= start),
		historyItems: available.items.filter((item) => item.publishedAt < start),
	};
}

async function requestFeed(url: string): Promise<RequestUrlResponse> {
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await requestUrl({ url, method: 'GET', headers: FEED_HEADERS, throw: false });
			if (response.status >= 400) throw new Error(`Источник вернул HTTP ${response.status}`);
			return response;
		} catch (error) {
			const transient = error instanceof Error && /(?:ERR_SOCKET_NOT_CONNECTED|ERR_CONNECTION_RESET|ERR_NETWORK_CHANGED|ETIMEDOUT|ECONNRESET)/.test(error.message);
			if (!transient || attempt >= 2) throw error;
			await new Promise<void>((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
		}
	}
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
	let timer: number | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = window.setTimeout(() => reject(new Error('Источник не ответил за 25 секунд')), SOURCE_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer) window.clearTimeout(timer);
	}
}

function inWindow(date: Date, start: Date, end: Date): boolean {
	return Number.isFinite(date.getTime()) && date >= start && date <= end;
}

function cleanText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

function plainFeedText(value: string | null | undefined): string {
	if (!value) return '';
	if (!/<[a-z][^>]*>/i.test(value)) return cleanText(value);
	const html = value.replace(/<\/?(?:br|p|div|li|h[1-6])\b[^>]*>/gi, ' $& ');
	const document = new DOMParser().parseFromString(html, 'text/html');
	document.querySelectorAll('script, style, iframe, noscript').forEach((element) => element.remove());
	return cleanText(document.body.textContent);
}

function titleFromText(text: string): string {
	const firstLine = cleanText(text.split(/\r?\n/, 1)[0]);
	return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine || 'Публикация без заголовка';
}

function httpUrl(value: string, base?: string): string | null {
	try {
		const url = new URL(value, base);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

function discoverFeedUrl(html: string, pageUrl: string): string | null {
	const document = new DOMParser().parseFromString(html, 'text/html');
	for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('head link[rel][type][href]'))) {
		const relations = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
		const type = (link.getAttribute('type') ?? '').toLowerCase().split(';', 1)[0]?.trim();
		if (!relations.includes('alternate') || (type !== 'application/rss+xml' && type !== 'application/atom+xml')) continue;
		const resolved = publicSourceUrl(link.getAttribute('href') ?? '', pageUrl);
		if (!resolved) continue;
		return resolved;
	}
	return null;
}

async function fetchPublicationFeed(publication: Publication, pageUrl: string, start: Date, end: Date): Promise<FeedResult> {
	const response = await requestFeed(pageUrl);
	if (response.text.length > MAX_FEED_BYTES) throw new Error('Лента слишком велика');
	const looksLikeHtml = isHtmlFeedResponse(response.text, response.headers);
	if (!looksLikeHtml) return parseFeedWithHistory(response.text, publication, start, end);
	const feedUrl = discoverFeedUrl(response.text, pageUrl);
	if (!feedUrl) throw new Error(`Источник вернул HTML вместо RSS (HTTP ${response.status}); ссылка на ленту на странице не найдена`);
	const feedResponse = await requestFeed(feedUrl);
	if (feedResponse.text.length > MAX_FEED_BYTES) throw new Error('Лента слишком велика');
	return parseFeedWithHistory(feedResponse.text, { ...publication, url: feedUrl }, start, end);
}

async function fetchCompanySource(company: Company, pageUrl: string, start: Date, end: Date): Promise<FeedResult> {
	const response = await requestUrl({ url: pageUrl, method: 'GET' });
	if (response.text.length > MAX_FEED_BYTES) throw new Error('Страница слишком велика');
	const source = { name: `${company.name} · Пресс центр компании`, url: pageUrl };
	const contentType = response.headers['content-type']?.toLowerCase() ?? '';
	const looksLikeHtml = contentType.includes('text/html') || /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(response.text);
	let result: FeedResult;
	if (looksLikeHtml) {
		const feedUrl = discoverFeedUrl(response.text, pageUrl);
		if (feedUrl) {
			const feedResponse = await requestUrl({ url: feedUrl, method: 'GET' });
			if (feedResponse.text.length > MAX_FEED_BYTES) throw new Error('Лента слишком велика');
			result = parseFeedWithHistory(feedResponse.text, { ...source, url: feedUrl }, start, end);
		} else {
			const recent = parseCompanyNewsPage(response.text, pageUrl, company.name, start, end);
			result = { ...recent, historyItems: parseCompanyNewsPage(response.text, pageUrl, company.name, sixMonthsBefore(end), end).items };
		}
	} else result = parseFeedWithHistory(response.text, source, start, end);
	return { ...result, items: result.items.map((item) => ({ ...item, companySource: company.name })),
		historyItems: result.historyItems?.map((item) => ({ ...item, companySource: company.name })) };
}

function directText(element: Element, tagName: string): string | null {
	const child = Array.from(element.children).find((item) => item.localName === tagName);
	return child?.textContent ?? null;
}

function atomLink(entry: Element, feedUrl: string): string | null {
	const links = Array.from(entry.children).filter((item) => item.localName === 'link');
	const alternate = links.find((item) => !item.getAttribute('rel') || item.getAttribute('rel') === 'alternate');
	return alternate ? httpUrl(alternate.getAttribute('href') ?? '', feedUrl) : null;
}

function parseFeed(xml: string, publication: Publication, start: Date, end: Date): FeedResult {
	const document = new DOMParser().parseFromString(xml, 'application/xml');
	if (document.getElementsByTagName('parsererror').length > 0) throw new Error('Лента содержит некорректный XML');
	const root = document.documentElement;
	if (!root) throw new Error('Пустая лента');
	const items: NewsItem[] = [];
	let earliest = Number.POSITIVE_INFINITY;
	let undated = 0;
	let entryCount = 0;
	if (root.localName === 'rss' || root.localName === 'RDF') {
		for (const entry of Array.from(document.getElementsByTagName('item'))) {
			entryCount++;
			// RSS pubDate is optional. Without it the strict 24-hour window cannot be verified.
			const publishedAt = new Date(directText(entry, 'pubDate') ?? '');
			if (Number.isFinite(publishedAt.getTime())) earliest = Math.min(earliest, publishedAt.getTime());
			else undated++;
			const url = httpUrl(cleanText(directText(entry, 'link')), publication.url);
			if (!url || !inWindow(publishedAt, start, end)) continue;
			const title = plainFeedText(directText(entry, 'title')) || 'Публикация без заголовка';
			const description = directText(entry, 'description');
			const content = Array.from(entry.children).find((item) => item.localName === 'encoded')?.textContent;
			items.push({ title, text: plainFeedText(content || description || title), url, source: publication.name, feedUrl: publication.url, publishedAt });
		}
	} else if (root.localName === 'feed') {
		for (const entry of Array.from(root.children).filter((item) => item.localName === 'entry')) {
			entryCount++;
			// updated may describe an old article edit; use published for the news window.
			const publishedAt = new Date(directText(entry, 'published') ?? '');
			if (Number.isFinite(publishedAt.getTime())) earliest = Math.min(earliest, publishedAt.getTime());
			else undated++;
			const url = atomLink(entry, publication.url);
			if (!url || !inWindow(publishedAt, start, end)) continue;
			const title = plainFeedText(directText(entry, 'title')) || 'Публикация без заголовка';
			items.push({
				title,
				text: plainFeedText(directText(entry, 'content') || directText(entry, 'summary') || title),
				url,
				source: publication.name,
				feedUrl: publication.url,
				publishedAt,
			});
		}
	} else {
		throw new Error('Адрес не содержит ленту RSS или Atom');
	}
	const hasNextPage = Array.from(document.getElementsByTagName('link')).some((link) => link.getAttribute('rel') === 'next');
	return {
		items,
		feed: { url: publication.url, source: publication.name,
			oldestPublishedAt: Number.isFinite(earliest) ? new Date(earliest).toISOString() : undefined,
			entryCount, undatedCount: undated, hasNextPage },
	};
}

function channelUsername(channel: Channel): string | null {
	const raw = channel.username.trim();
	let username = raw;
	if (raw.startsWith('https://t.me/')) username = raw.slice('https://t.me/'.length);
	if (username.startsWith('@')) username = username.slice(1);
	return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null;
}

async function fetchPublicWeb(channel: Channel, start: Date, end: Date): Promise<{items: NewsItem[]; incomplete: boolean}> {
	const username = channelUsername(channel);
	if (!username) throw new Error('Некорректный публичный @username');
	const response = await requestUrl({ url: `https://t.me/s/${username}`, method: 'GET' });
	const document = new DOMParser().parseFromString(response.text, 'text/html');
	const posts = Array.from(document.querySelectorAll<HTMLElement>('.tgme_widget_message[data-post]'));
	if (!posts.length) throw new Error('Публичная страница не содержит доступных постов');
	const items: NewsItem[] = [];
	let oldestTime = Number.POSITIVE_INFINITY;
	for (const post of posts) {
		const postId = post.getAttribute('data-post');
		if (!postId?.startsWith(`${username}/`)) continue;
		const publishedAt = new Date(post.querySelector('time[datetime]')?.getAttribute('datetime') ?? '');
		if (!Number.isFinite(publishedAt.getTime())) continue;
		oldestTime = Math.min(oldestTime, publishedAt.getTime());
		if (!inWindow(publishedAt, start, end)) continue;
		const text = cleanText(post.querySelector('.tgme_widget_message_text')?.textContent);
		if (!text) continue;
		items.push({ title: titleFromText(text), text, url: `https://t.me/${postId}`,
			source: channel.name, publishedAt, channel: true });
	}
	return { items, incomplete: oldestTime > start.getTime() };
}

/** Collects dated source material only; editorial selection happens separately. */
export async function collectNews(
	companies: Company[],
	publications: Publication[],
	channels: Channel[],
	settings: Pick<InvestSettings, 'telegramProvider' | 'llmProvider'>,
	start: Date,
	end: Date,
	mtprotoReader?: (channel: Channel, start: Date, end: Date) => Promise<MtprotoChannelResult>,
): Promise<NewsCollection> {
	const items: NewsItem[] = [];
	const historyItems: NewsItem[] = [];
	const issues: SourceIssue[] = [];
	const feeds: FeedObservation[] = [];
	const tasks: (() => Promise<void>)[] = [];
	for (const company of companies) if (company.news) tasks.push(async () => {
		const source = `${company.name} · пресс-центр`;
		const url = publicSourceUrl(company.news ?? '');
		if (!url) {
			issues.push({ source, message: 'Некорректный публичный адрес пресс-центра' });
			return;
		}
		try {
			const result = await withTimeout(fetchCompanySource(company, url, start, end));
			items.push(...result.items);
			historyItems.push(...(result.historyItems ?? []).filter((item) => item.publishedAt < start));
			if (result.issue) issues.push({ source, message: result.issue });
		} catch (error) {
			issues.push({ source, message: publicationFailure(error) });
		}
	});
	for (const publication of publications) tasks.push(async () => {
		const url = publicSourceUrl(publication.url);
		if (!url) {
			issues.push({ source: publication.name, message: 'Некорректный адрес ленты' });
			return;
		}
		try {
			const result = await withTimeout(fetchPublicationFeed(publication, url, start, end));
			items.push(...result.items);
			historyItems.push(...(result.historyItems ?? []).filter((item) => item.publishedAt < start));
			if (result.feed) feeds.push({ ...result.feed, url: publication.url, fetchedAt: new Date().toISOString() });
			if (result.issue) issues.push({ source: publication.name, message: result.issue });
		} catch (error) {
			issues.push({ source: publication.name, message: publicationFailure(error) });
		}
	});
	if (settings.telegramProvider !== 'off') for (const channel of channels) tasks.push(async () => {
		try {
			if (settings.telegramProvider === 'mtproto') {
				if (!mtprotoReader) throw new Error('Чтение MTProto недоступно');
				const collected = await withTimeout(mtprotoReader(channel, start, end));
				items.push(...collected.items);
				if (collected.truncated) issues.push({ source: channel.name, message: 'Больше 1000 постов за период; охват может быть неполным' });
			} else {
				const collected = await withTimeout(fetchPublicWeb(channel, start, end));
				items.push(...collected.items);
				issues.push({ source: channel.name, message: collected.incomplete ? 'Публичная страница показывает не все посты за 24 часа' : 'Публичный веб-просмотр не гарантирует полный охват постов' });
			}
		} catch (error) {
			const known = error instanceof Error && ['Некорректный публичный @username', 'Публичная страница не содержит доступных постов', 'Источник не ответил за 25 секунд', 'Чтение MTProto недоступно', 'Сначала войдите в Telegram в настройках плагина', 'Сессия Telegram недействительна; войдите снова', 'Не удалось восстановить Telegram-сессию; попробуйте войти снова', 'Telegram временно ограничил частоту запросов; повторите позже', 'Укажите числовой Telegram API ID', 'Выберите Telegram API Hash в хранилище секретов'].includes(error.message);
			const message = known ? error.message
				: settings.telegramProvider === 'public-web' ? publicationFailure(error) : 'Не удалось получить посты канала';
			issues.push({ source: channel.name, message });
		}
	});
	await runTasks(tasks, sourceConcurrency(settings.llmProvider));
	return { items, historyItems, issues, checkedSources: tasks.length, feeds };
}
