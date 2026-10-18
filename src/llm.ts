import { requestUrl } from 'obsidian';
import type { InvestSettings } from './types';
import { cloudBaseUrl } from './llm-endpoint';

function localBaseUrl(settings: InvestSettings): string {
  let url: URL;
  try { url = new URL(settings.localLlmUrl); } catch { throw new Error('Некорректный адрес локальной модели'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Адрес локальной модели должен указывать на localhost или 127.0.0.1');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Некорректный HTTP(S) адрес локальной модели');
  }
  return url.href.replace(/\/$/, '');
}

export function configuredModel(settings: InvestSettings): boolean {
  return settings.llmProvider === 'cloud' ? Boolean(settings.cloudLlmUrl.trim() && settings.cloudLlmModel.trim() && settings.cloudLlmApiKey.trim()) : Boolean(settings.localLlmModel.trim());
}

function connection(settings: InvestSettings): { base: string; model: string; headers: Record<string, string> } {
  if (settings.llmProvider === 'cloud') {
    if (!settings.cloudLlmModel.trim()) throw new Error('Укажите облачную модель');
    if (!settings.cloudLlmApiKey.trim()) throw new Error('Свяжите ключ облачной модели в настройках');
    return {
      base: cloudBaseUrl(settings.cloudLlmUrl), model: settings.cloudLlmModel.trim(),
      headers: { Authorization: `Bearer ${settings.cloudLlmApiKey.trim()}` },
    };
  }
  if (!settings.localLlmModel.trim()) throw new Error('Укажите локальную модель');
  return { base: localBaseUrl(settings), model: settings.localLlmModel.trim(), headers: {} };
}

export async function completeModel(settings: InvestSettings, system: string, user: string): Promise<string> {
  const { base, model, headers } = connection(settings);
  let response;
  try {
    response = await requestUrl({
      url: `${base}/chat/completions`, method: 'POST', contentType: 'application/json', headers,
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      throw: false,
    });
  } catch { throw new Error('Не удалось связаться с выбранной моделью'); }
  if (response.status >= 400) throw new Error(`Модель вернула HTTP ${response.status}`);
  const data = response.json as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Модель вернула пустой ответ');
  return content;
}

export async function checkModel(settings: InvestSettings): Promise<void> {
  const result = await completeModel(settings, 'Ответь одним словом по-русски.', 'Готово?');
  if (!result.trim()) throw new Error('Модель не ответила');
}
