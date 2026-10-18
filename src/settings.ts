import { App, Modal, Notice, Plugin, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import { loadChannels, loadConfig } from './config';
import { applyTemplatePaths, CONFIG_TEMPLATES } from './config-templates';
import { initializeConfigFiles } from './initialize';
import { checkModel } from './llm';
import { fetchMarket } from './market';
import { REPORT_ROOT } from './report-path';
import { collectNews } from './news';
import { readRenderedCompanyPage } from './playwright-company';
import { preparationTime, recentWindow } from './time';
import type { TelegramMtproto } from './telegram-mtproto';
import type { InvestSettings } from './types';

export interface SettingsHost extends Plugin {
  settings: InvestSettings;
  saveSettings(): Promise<void>;
  telegram: TelegramMtproto;
}

type PathKey = 'companiesPath' | 'topicsPath' | 'channelsPath' | 'publicationsPath' | 'localLlmUrl' | 'localLlmModel' | 'cloudLlmUrl' | 'cloudLlmModel';

class FormatHelpModal extends Modal {
  onOpen(): void {
    this.modalEl.addClass('invest-manager-help-modal');
    const root = this.contentEl;
    root.empty();
    root.addClass('invest-manager-help');
    root.createEl('h2', { text: 'Формат входных файлов' });
    root.createEl('p', { cls: 'invest-manager-help-intro', text: 'Скопируйте нужный шаблон в заметку и замените примерные значения своими. Копирование не изменяет файлы.' });
    const example = (title: string, description: string, markdown: string): void => {
      const card = root.createDiv({ cls: 'invest-manager-help-card' });
      card.createEl('h3', { text: title });
      card.createEl('p', { text: description });
      card.createEl('pre').createEl('code', { text: markdown });
      const actions = card.createDiv({ cls: 'invest-manager-help-actions' });
      actions.createEl('button', { text: 'Скопировать шаблон', cls: 'mod-cta', attr: { 'aria-label': `Скопировать шаблон: ${title}` } })
        .addEventListener('click', () => {
          void navigator.clipboard.writeText(markdown).then(
            () => new Notice(`Шаблон «${title}» скопирован`),
            () => new Notice('Не удалось скопировать шаблон', 8000),
          );
        });
    };
    for (const template of CONFIG_TEMPLATES) example(template.title, template.description, template.markdown);
  }
}

class TelegramApiHelpModal extends Modal {
  onOpen(): void {
    this.modalEl.addClass('invest-manager-help-modal');
    const root = this.contentEl;
    root.empty();
    root.addClass('invest-manager-help');
    root.createEl('h2', { text: 'Как получить Telegram API ID' });
    root.createEl('p', { cls: 'invest-manager-help-intro', text: 'Для MTProto нужны API ID и API hash вашего Telegram-приложения. Это не токен бота.' });
    const steps = root.createEl('ol', { cls: 'invest-manager-help-steps' });
    const login = steps.createEl('li');
    login.appendText('Войдите на ');
    const site = login.createEl('a', { text: 'my.telegram.org', href: 'https://my.telegram.org' });
    site.setAttr('target', '_blank');
    site.setAttr('rel', 'noopener noreferrer');
    login.appendText(' под своим номером Telegram.');
    steps.createEl('li', { text: 'Откройте раздел «API development tools» и заполните форму создания приложения.' });
    steps.createEl('li', { text: 'Скопируйте числовой API ID в поле «Telegram API ID» ниже.' });
    steps.createEl('li', { text: 'Для API hash создайте секрет в хранилище Obsidian и выберите его в поле «Telegram API Hash». Не записывайте hash в заметки.' });
    steps.createEl('li', { text: 'Нажмите «Войти» в строке «Аккаунт Telegram» и завершите вход по коду.' });
    const note = root.createDiv({ cls: 'invest-manager-help-note' });
    note.appendText('Подробности: ');
    const docs = note.createEl('a', { text: 'официальная инструкция Telegram', href: 'https://core.telegram.org/api/obtaining_api_id' });
    docs.setAttr('target', '_blank');
    docs.setAttr('rel', 'noopener noreferrer');
  }
}

export class InvestSettingTab extends PluginSettingTab {
  constructor(app: App, private host: SettingsHost) { super(app, host); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const help = containerEl.createDiv({ cls: 'invest-manager-settings-help' });
    new Setting(help).setName('Справка и инструкции').setHeading();
    new Setting(help).setName('Формат входных файлов').setDesc('Примеры заполнения и шаблоны четырёх файлов.').addButton((button) => button.setButtonText('Открыть').onClick(() => {
      new FormatHelpModal(this.app).open();
    }));
    new Setting(help).setName('Подключение Telegram').setDesc('Как получить API ID и API Hash и войти через MTProto.').addButton((button) => button
      .setButtonText('Открыть')
      .onClick(() => { new TelegramApiHelpModal(this.app).open(); }));

    const files = this.section('Входные файлы');
    files.createEl('p', { text: 'Файлы должны находиться внутри хранилища Obsidian.' });
    new Setting(files).setName('Начальные файлы').setDesc('Создать четыре примера в «Статистика». Существующие файлы сохранятся.').addButton((button) => button.setButtonText('Инициализировать').onClick(async () => {
      button.setDisabled(true);
      try {
        const result = await initializeConfigFiles(this.app);
        applyTemplatePaths(this.host.settings);
        await this.host.saveSettings();
        this.display();
        new Notice(`Файлы готовы: создано ${result.created}, уже существовали ${result.existing}. Замените примерные значения своими.`, 10000);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error), 8000);
      } finally { button.setDisabled(false); }
    }));

    this.path('Компании портфеля', '', 'companiesPath', files);
    this.path('Темы новостей', '', 'topicsPath', files);
    this.path('RSS-ленты изданий', 'Названия и прямые адреса RSS/Atom', 'publicationsPath', files);
    new Setting(files).setName('Пресс-центры компаний через браузер')
      .setDesc('Если обычный запрос не нашёл свежих датированных новостей, Playwright MCP откроет страницу в изолированном браузере. Нужны Node.js и npx.')
      .addDropdown((dropdown) => dropdown
        .addOption('fallback', 'Использовать при необходимости')
        .addOption('off', 'Выключено')
        .setValue(this.host.settings.companyBrowserMode)
        .onChange(async (value) => {
          this.host.settings.companyBrowserMode = value as InvestSettings['companyBrowserMode'];
          await this.host.saveSettings();
        }));
    new Setting(files).setName('Проверить Playwright MCP')
      .setDesc('Открывает тестовую публичную страницу и проверяет, что браузер возвращает HTML. Заметки не изменяются.')
      .addButton((button) => button.setButtonText('Проверить').onClick(async () => {
        button.setDisabled(true);
        try {
          const html = await readRenderedCompanyPage('https://example.com');
          if (!html.includes('Example Domain')) throw new Error('Браузер вернул неожиданную страницу');
          new Notice('Playwright MCP готов к чтению пресс-центров');
        } catch (error) {
          new Notice(`Playwright MCP: ${error instanceof Error ? error.message : String(error)}`, 10000);
        } finally { button.setDisabled(false); }
      }));
    new Setting(files).setClass('invest-manager-settings-path').setName('Папка статистики').setDesc('Отчёты создаются только здесь.').addText((text) => text.setValue(REPORT_ROOT).setDisabled(true));

    new Setting(files).setName('Проверить файлы').setDesc('Проверяет формат и обязательные поля четырёх входных файлов.').addButton((button) => button.setButtonText('Проверить').onClick(async () => {
      try {
        const config = await loadConfig(this.app, this.host.settings);
        new Notice(`Файлы готовы: ${config.companies.length} компаний, ${config.topics.length} тем, ${config.channels.length} каналов, ${config.publications.length} изданий`);
      } catch (error) { new Notice(error instanceof Error ? error.message : String(error), 8000); }
    }));

    const scheduleBlock = this.section('Расписание сводки');
    const scheduleDescription = (time: string): string => {
      const previousDay = Number(time.slice(0, 2)) === 0 && Number(time.slice(3)) < 30;
      return `Время по Москве. Агент начнёт работу в ${preparationTime(time)}${previousDay ? ' предыдущего дня' : ''} — за 30 минут до указанного времени. Итог может быть готов позже, если источники или модель отвечают долго.`;
    };
    const schedule = new Setting(scheduleBlock).setName('К какому времени готовить отчёт').setDesc(scheduleDescription(this.host.settings.digestReadyTime));
    schedule.addText((input) => {
      input.inputEl.type = 'time';
      input.setValue(this.host.settings.digestReadyTime).onChange(async (value) => {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
        this.host.settings.digestReadyTime = value;
        schedule.setDesc(scheduleDescription(value));
        await this.host.saveSettings();
      });
    });

    const model = this.section('Модель для анализа');
    let localModel: HTMLElement;
    let cloudModel: HTMLElement;
    new Setting(model).setName('Режим').setDesc('Облачная модель получает отобранные новости. Локальная обрабатывает их на этом компьютере.').addDropdown((dropdown) => dropdown
      .addOption('local', 'Локальная модель')
      .addOption('cloud', 'Облачная модель')
      .setValue(this.host.settings.llmProvider)
      .onChange(async (value) => {
        this.host.settings.llmProvider = value as InvestSettings['llmProvider'];
        localModel.hidden = value !== 'local';
        cloudModel.hidden = value !== 'cloud';
        await this.host.saveSettings();
      }));
    localModel = model.createDiv({ cls: 'invest-manager-settings-conditional' });
    cloudModel = model.createDiv({ cls: 'invest-manager-settings-conditional' });
    localModel.hidden = this.host.settings.llmProvider !== 'local';
    cloudModel.hidden = this.host.settings.llmProvider !== 'cloud';
    this.path('Локальный адрес API', 'Ollama: http://127.0.0.1:11434/v1; LM Studio: http://127.0.0.1:1234/v1', 'localLlmUrl', localModel);
    this.path('Локальная модель', 'ID запущенной модели', 'localLlmModel', localModel);
    this.path('Адрес API облачной модели', 'HTTPS-адрес Chat Completions API', 'cloudLlmUrl', cloudModel);
    this.path('Облачная модель', 'ID модели у провайдера', 'cloudLlmModel', cloudModel);
    new Setting(cloudModel).setName('Ключ облачной модели').setDesc('Секрет Obsidian выбранного провайдера.').addComponent((el) => new SecretComponent(this.app, el)
      .setValue(this.host.settings.cloudLlmSecretId)
      .onChange(async (value) => {
        this.host.settings.cloudLlmSecretId = value ?? '';
        this.host.settings.cloudLlmApiKey = value ? this.app.secretStorage.getSecret(value) ?? '' : '';
        await this.host.saveSettings();
      }));
    const rag = this.section('Контекст проекта (RAG)');
    new Setting(rag).setName('Использовать RAG')
      .setDesc('При составлении отчёта искать подходящие заметки через установленный плагин AI Advent RAG и учитывать их при выборе новостей. Индекс создаётся и хранится в AI Advent RAG.')
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.ragEnabled)
        .onChange(async (value) => {
          this.host.settings.ragEnabled = value;
          await this.host.saveSettings();
        }));
    new Setting(rag).setName('Передавать фрагменты заметок облачной модели')
      .setDesc('Отдельное разрешение для RAG при облачной модели. Выбранные фрагменты личных заметок отправляются провайдеру вместе с запросом. По умолчанию выключено; поиск по индексу остаётся локальным.')
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.allowCloudVaultContext)
        .onChange(async (value) => {
          this.host.settings.allowCloudVaultContext = value;
          await this.host.saveSettings();
        }));
    new Setting(model).setName('Проверить модель').setDesc('Отправляет короткий тестовый запрос выбранной модели.').addButton((button) => button.setButtonText('Проверить').onClick(async () => {
      try { await checkModel(this.host.settings); new Notice('Модель ответила на тестовый запрос'); }
      catch (error) { new Notice(error instanceof Error ? error.message : String(error), 8000); }
    }));

    const telegram = this.section('Новости Telegram');
    this.path('Telegram-каналы', 'Название и @username каждого канала', 'channelsPath', telegram);
    let mtproto: HTMLElement;
    new Setting(telegram).setName('Способ чтения').setDesc('MTProto читает историю от имени вашего аккаунта. Публичный просмотр может пропускать посты.').addDropdown((dropdown) => dropdown
      .addOption('mtproto', 'Telegram MTProto')
      .addOption('public-web', 'Публичные страницы Telegram')
      .addOption('off', 'Выключено')
      .setValue(this.host.settings.telegramProvider)
      .onChange(async (value) => {
        this.host.settings.telegramProvider = value as InvestSettings['telegramProvider'];
        mtproto.hidden = value !== 'mtproto';
        await this.host.saveSettings();
      }));
    mtproto = telegram.createDiv({ cls: 'invest-manager-settings-conditional' });
    mtproto.hidden = this.host.settings.telegramProvider !== 'mtproto';
    new Setting(mtproto).setName('Telegram API ID').setDesc('Числовой ID вашего приложения.').addText((input) => input
      .setPlaceholder('12345678')
      .setValue(this.host.settings.telegramApiId)
      .onChange(async (value) => { this.host.settings.telegramApiId = value.trim(); await this.host.saveSettings(); }));
    new Setting(mtproto).setName('Telegram API Hash').setDesc('Секрет Obsidian с API Hash.').addComponent((el) => new SecretComponent(this.app, el)
      .setValue(this.host.settings.telegramApiHashSecretId)
      .onChange(async (value) => {
        this.host.settings.telegramApiHashSecretId = value ?? '';
        await this.host.saveSettings();
      }));
    new Setting(mtproto).setName('Аккаунт Telegram').setDesc('После первого входа сессия сохраняется в секретах Obsidian.').addButton((button) => button
      .setButtonText(this.host.telegram.hasSession() ? 'Войти заново' : 'Войти')
      .onClick(async () => {
        button.setDisabled(true);
        try {
          const account = await this.host.telegram.login();
          this.host.settings.telegramProvider = 'mtproto';
          await this.host.saveSettings();
          new Notice(`Telegram подключён: ${account}`);
          this.display();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : 'Ошибка входа в Telegram', 8000);
        } finally { button.setDisabled(false); }
      }))
      .addExtraButton((button) => button.setIcon('log-out').setTooltip('Завершить Telegram-сессию').onClick(async () => {
        try {
          await this.host.telegram.logout();
          new Notice('Сессия Telegram завершена');
          this.display();
        } catch { new Notice('Локальная сессия удалена; завершение на сервере не подтверждено', 8000); }
      }));
    new Setting(telegram).setName('Анализировать Telegram моделью').setDesc('Отправляет тексты постов выбранной модели. В облачном режиме — её провайдеру. Проверьте условия Telegram.').addToggle((toggle) => toggle
      .setValue(this.host.settings.telegramLlmEnabled)
      .onChange(async (value) => { this.host.settings.telegramLlmEnabled = value; await this.host.saveSettings(); }));
    new Setting(mtproto).setName('Проверить MTProto').setDesc('Читает один канал из файла за 24 часа.').addButton((button) => button.setButtonText('Проверить').onClick(async () => {
      button.setDisabled(true);
      try {
        const channels = await loadChannels(this.app, this.host.settings);
        const channel = channels[0];
        if (!channel) throw new Error('В файле Telegram нет каналов');
        const window = recentWindow(new Date());
        const result = await this.host.telegram.readChannel(channel, window.start, window.end);
        new Notice(`${channel.name}: получено ${result.items.length} постов за 24 часа${result.truncated ? '; достигнут предел 1000 постов' : ''}.`, 10000);
      } catch (error) { new Notice(error instanceof Error ? error.message : 'Не удалось проверить MTProto', 8000); }
      finally { button.setDisabled(false); }
    }));
    const market = this.section('Рынок и ставки');
    let eiaKey: HTMLElement;
    new Setting(market).setName('Brent').addDropdown((dropdown) => dropdown
      .addOption('eia', 'Спот EIA')
      .addOption('moex', 'Фьючерс BR Мосбиржи')
      .addOption('off', 'Выключено')
      .setValue(this.host.settings.brentProvider)
      .onChange(async (value) => {
        this.host.settings.brentProvider = value as InvestSettings['brentProvider'];
        eiaKey.hidden = value !== 'eia';
        await this.host.saveSettings();
      }));
    eiaKey = market.createDiv({ cls: 'invest-manager-settings-conditional' });
    eiaKey.hidden = this.host.settings.brentProvider !== 'eia';
    new Setting(eiaKey).setName('Ключ EIA').setDesc('Секрет Obsidian с ключом EIA.').addComponent((el) => new SecretComponent(this.app, el)
      .setValue(this.host.settings.eiaSecretId)
      .onChange(async (value) => {
        this.host.settings.eiaSecretId = value ?? '';
        this.host.settings.eiaApiKey = value ? this.app.secretStorage.getSecret(value) ?? '' : '';
        await this.host.saveSettings();
      }));
    this.sourceToggle('USD/RUB', 'usdProvider', market);
    this.sourceToggle('CNY/RUB', 'cnyProvider', market);
    new Setting(market).setName('Золото').addDropdown((dropdown) => dropdown
      .addOption('moex', 'GLDRUB_TOM Мосбиржи')
      .addOption('off', 'Выключено')
      .setValue(this.host.settings.goldProvider)
      .onChange(async (value) => { this.host.settings.goldProvider = value as InvestSettings['goldProvider']; await this.host.saveSettings(); }));
    new Setting(market).setName('Индекс Мосбиржи').setDesc('График IMOEX с переключением периода: день, неделя, две недели, месяц и год. Месячный снимок сохраняется в отчёте.').addDropdown((dropdown) => dropdown
      .addOption('moex', 'Московская биржа, ISS')
      .addOption('off', 'Выключено')
      .setValue(this.host.settings.imoexProvider)
      .onChange(async (value) => { this.host.settings.imoexProvider = value as InvestSettings['imoexProvider']; await this.host.saveSettings(); }));
    market.createEl('p', { text: 'Ставки и календари: данные Банка России и ФРС.' });
    const checks = this.section('Проверка источников');
    new Setting(checks).setName('Проверить источники').setDesc('Проверяет доступность настроенных лент, каналов и рыночных данных за последние 24 часа.').addButton((button) => button.setButtonText('Проверить').onClick(async () => {
      button.setDisabled(true);
      try {
        const config = await loadConfig(this.app, this.host.settings);
        const window = recentWindow(new Date());
        const newsTask = () => collectNews(config.companies, config.publications, config.channels, this.host.settings, window.start, window.end,
          (channel, start, end) => this.host.telegram.readChannel(channel, start, end), readRenderedCompanyPage);
        const marketTask = () => fetchMarket(this.host.settings);
        const [news, market] = this.host.settings.llmProvider === 'cloud'
          ? await Promise.all([newsTask(), marketTask()])
          : [await newsTask(), await marketTask()];
        new Notice(`Проверено: ${news.checkedSources + market.checkedSources}. Новости: ${news.items.length}, рыночные данные: ${market.points.length}, ограничения: ${news.issues.length + market.issues.length}.`, 10000);
      } catch (error) { new Notice(error instanceof Error ? error.message : String(error), 8000); }
      finally { button.setDisabled(false); }
    }));
  }

  private section(title: string): HTMLElement {
    const section = this.containerEl.createDiv({ cls: 'invest-manager-settings-section' });
    new Setting(section).setName(title).setHeading();
    return section;
  }

  private path(label: string, description: string, key: PathKey, container: HTMLElement): void {
    new Setting(container).setClass('invest-manager-settings-path').setName(label).setDesc(description).addText((text) => text
      .setPlaceholder(key === 'localLlmUrl' ? 'http://127.0.0.1:11434/v1' : key === 'localLlmModel' ? 'llama3' : key === 'cloudLlmUrl' ? 'https://api.openai.com/v1' : key === 'cloudLlmModel' ? 'ID модели' : 'Папка/Файл.md')
      .setValue(this.host.settings[key])
      .onChange(async (value) => { this.host.settings[key] = value.trim(); await this.host.saveSettings(); }));
  }

  private sourceToggle(label: string, key: 'usdProvider' | 'cnyProvider', container: HTMLElement): void {
    new Setting(container).setName(label).addDropdown((dropdown) => dropdown
      .addOption('cbr', 'Официальный курс ЦБ РФ')
      .addOption('off', 'Выключено')
      .setValue(this.host.settings[key])
      .onChange(async (value) => { this.host.settings[key] = value as InvestSettings[typeof key]; await this.host.saveSettings(); }));
  }
}
