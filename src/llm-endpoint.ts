export function cloudBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Укажите корректный адрес API облачной модели'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Адрес API облачной модели должен быть HTTPS без логина, параметров и фрагмента');
  }
  return url.href.replace(/\/$/, '');
}
