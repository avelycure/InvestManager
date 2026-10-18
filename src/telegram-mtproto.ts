import { App, Modal } from 'obsidian';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import type { Channel, InvestSettings, NewsItem } from './types';
import { telegramWindow } from './telegram-window';

const SESSION_SECRET_ID = 'invest-manager-telegram-session';
const MAX_POSTS_PER_CHANNEL = 1000;

function telegramCredentials(app: App, settings: InvestSettings): { apiId: number; apiHash: string } {
  const apiId = Number(settings.telegramApiId.trim());
  if (!Number.isSafeInteger(apiId) || apiId <= 0) throw new Error('Укажите числовой Telegram API ID');
  const apiHash = settings.telegramApiHashSecretId
    ? app.secretStorage.getSecret(settings.telegramApiHashSecretId)?.trim() ?? '' : '';
  if (!apiHash) throw new Error('Выберите Telegram API Hash в хранилище секретов');
  return { apiId, apiHash };
}

class TelegramPrompt extends Modal {
  private resolve?: (value: string) => void;
  private reject?: (error: Error) => void;

  constructor(app: App, private label: string, private secret: boolean, private phone = false) { super(app); }

  ask(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.open();
    });
  }

  onOpen(): void {
    this.modalEl.addClass('invest-manager-telegram-prompt');
    this.setTitle(this.label);
    this.contentEl.empty();
    if (this.phone) this.contentEl.createEl('p', {
      text: 'Введите номер с кодом страны: например, +7 999 123-45-67. Пробелы и дефисы допустимы.',
    });
    const form = this.contentEl.createEl('form');
    const input = form.createEl('input', { type: this.phone ? 'tel' : this.secret ? 'password' : 'text' });
    input.setAttribute('autocomplete', this.phone ? 'tel' : 'off');
    input.setAttribute('aria-label', this.label);
    if (this.phone) {
      input.setAttribute('inputmode', 'tel');
      input.setAttribute('placeholder', '+7 999 123-45-67');
    }
    input.required = true;
    const error = form.createEl('p', { cls: 'invest-manager-telegram-prompt__error', attr: { role: 'alert' } });
    const actions = form.createDiv({ cls: 'invest-manager-telegram-prompt__actions' });
    actions.createEl('button', { text: 'Отмена', type: 'button' }).addEventListener('click', () => this.close());
    actions.createEl('button', { text: 'Продолжить', type: 'submit', cls: 'mod-cta' });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let value = input.value.trim();
      if (!value) return;
      if (this.phone) {
        value = value.replace(/[\s()-]/g, '');
        if (!/^\+[1-9]\d{7,14}$/.test(value)) {
          error.setText('Укажите номер с «+» и кодом страны: от 8 до 15 цифр.');
          input.focus();
          return;
        }
      }
      this.resolve?.(value);
      this.resolve = undefined;
      this.reject = undefined;
      this.close();
    });
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.reject?.(new Error('AUTH_USER_CANCEL'));
    this.resolve = undefined;
    this.reject = undefined;
  }
}

function username(channel: Channel): string {
  const name = channel.username.replace(/^@/, '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) throw new Error('Некорректный @username канала');
  return name;
}

export interface MtprotoChannelResult { items: NewsItem[]; truncated: boolean }

export class TelegramMtproto {
  private client?: TelegramClient;
  private connecting?: Promise<TelegramClient>;

  constructor(private app: App, private getSettings: () => InvestSettings) {}

  hasSession(): boolean {
    return Boolean(this.app.secretStorage.getSecret(SESSION_SECRET_ID));
  }

  private async savedClient(): Promise<TelegramClient> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const { apiId, apiHash } = telegramCredentials(this.app, this.getSettings());
      const saved = this.app.secretStorage.getSecret(SESSION_SECRET_ID);
      if (!saved) throw new Error('Сначала войдите в Telegram в настройках плагина');
      let client: TelegramClient | undefined;
      try {
        client = new TelegramClient(new StringSession(saved), apiId, apiHash, { connectionRetries: 2 });
        await client.connect();
        if (!await client.isUserAuthorized()) throw new Error('Сессия Telegram недействительна; войдите снова');
        this.client = client;
        return client;
      } catch (error) {
        if (client) await client.disconnect();
        if (error instanceof Error && error.message === 'Сессия Telegram недействительна; войдите снова') throw error;
        throw new Error('Не удалось восстановить Telegram-сессию; попробуйте войти снова');
      }
    })();
    try { return await this.connecting; }
    finally { this.connecting = undefined; }
  }

  async login(): Promise<string> {
    await this.disconnect();
    const { apiId, apiHash } = telegramCredentials(this.app, this.getSettings());
    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 2 });
    try {
      await client.start({
        phoneNumber: () => new TelegramPrompt(this.app, 'Номер телефона Telegram', false, true).ask(),
        phoneCode: () => new TelegramPrompt(this.app, 'Код входа из Telegram', true).ask(),
        password: () => new TelegramPrompt(this.app, 'Пароль двухэтапной проверки Telegram', true).ask(),
        emailAddress: () => new TelegramPrompt(this.app, 'Адрес почты для проверки Telegram', false).ask(),
        emailVerification: async () => ({ type: 'code' as const, code: await new TelegramPrompt(this.app, 'Код из письма Telegram', true).ask() }),
        onError: async () => false,
      });
      if (!await client.isUserAuthorized()) throw new Error('Telegram не подтвердил вход');
      const me = await client.getMe();
      this.app.secretStorage.setSecret(SESSION_SECRET_ID, client.session.save());
      this.client = client;
      return me.username ? `@${me.username}` : 'аккаунт Telegram';
    } catch (error) {
      await client.disconnect();
      if (error instanceof Error && error.message === 'AUTH_USER_CANCEL') throw new Error('Вход в Telegram отменён');
      throw new Error('Не удалось войти в Telegram. Проверьте API ID, API Hash, код и пароль');
    }
  }

  async logout(): Promise<void> {
    try {
      const client = this.client ?? (this.hasSession() ? await this.savedClient() : undefined);
      if (client) await client.logOut();
    } finally {
      this.app.secretStorage.setSecret(SESSION_SECRET_ID, '');
      await this.disconnect();
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) await client.disconnect();
  }

  async readChannel(channel: Channel, start: Date, end: Date): Promise<MtprotoChannelResult> {
    const name = username(channel);
    const client = await this.savedClient();
    try {
      return await telegramWindow(client.iterMessages(`@${name}`, {
        limit: MAX_POSTS_PER_CHANNEL + 1,
        offsetDate: Math.floor(end.getTime() / 1000) + 1,
      }), channel, name, start, end, MAX_POSTS_PER_CHANNEL);
    } catch (error) {
      if (error instanceof Error && error.name.toLowerCase().includes('floodwait')) {
        throw new Error('Telegram временно ограничил частоту запросов; повторите позже');
      }
      throw new Error(`Не удалось прочитать канал @${name} через MTProto`);
    }
  }
}
