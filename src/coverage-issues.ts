import type { SourceIssue } from './types';

/** Keep source failures visible, while summarizing repeated feed-depth notices. */
export function compactCoverageIssues(issues: SourceIssue[]): SourceIssue[] {
  const shallowFeeds: string[] = [];
  const publicTelegram: string[] = [];
  const rest: SourceIssue[] = [];
  for (const issue of issues) {
    if (issue.message.startsWith('полный охват пока не подтверждён')) shallowFeeds.push(issue.source);
    else if (/^Публичная страница показывает не все посты за 24 часа$|^Публичный веб-просмотр не гарантирует полный охват постов$/.test(issue.message)) publicTelegram.push(issue.source);
    else rest.push(issue);
  }
  if (shallowFeeds.length) rest.push({ source: 'История RSS', message: `Глубина ${shallowFeeds.length} лент не подтверждает полный охват 24 часов: ${shallowFeeds.join(', ')}. Показаны доступные публикации с датами` });
  if (publicTelegram.length) rest.push({ source: 'Telegram', message: `Публичный просмотр может показывать не все посты: ${publicTelegram.join(', ')}. Для полного чтения используйте MTProto` });
  return rest;
}
