export function latestTitle(news: Array<{ title: string }>): string {
  return news[0]!.title;
}
