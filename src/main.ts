import { Notice, Plugin, TFile } from 'obsidian';
import { loadConfig } from './config';
import { buildDigest, prepareNews } from './digest';
import { collectNews, type NewsCollection } from './news';
import { ReportStore, renderDigest } from './report';
import { RssCacheStore } from './rss-cache-store';
import { NewsFeedbackStore } from './news-feedback';
import { REPORT_ROOT, reportPath } from './report-path';
import { restoreDigestSnapshot, saveDigestSnapshot } from './snapshot';
import { DigestSnapshotStore } from './snapshot-store';
import { HELP_DOCUMENTS } from './help-documents';
import { buildHelpRequest, helpSystemPrompt, type HelpExchange } from './help';
import { completeModel, configuredModel } from './llm';
import { renderStockChart } from './stock-chart-view';
import { applyCompanyCardColors } from './company-brand';
import { renderImoexChart } from './imoex-chart-view';
import { InvestSettingTab } from './settings';
import { TelegramMtproto } from './telegram-mtproto';
import { readRenderedCompanyPage } from './playwright-company';
import { projectRagContext } from './rag-context';
import { findRelatedNotes } from './related-notes';
import { dueDigest, morningWindow, moscowDateKey, recentWindow } from './time';
import { DEFAULT_SETTINGS, type DigestResult, type InvestSettings, type NewsRating, type SelectedNews } from './types';
import { AgentView, INVEST_VIEW_TYPE } from './view';

interface Prefetch {
  dateKey: string;
  readyTime: string;
  end: Date;
  news: NewsCollection;
  semanticTopics?: Map<string, string>;
}

export default class InvestManagerPlugin extends Plugin {
  settings: InvestSettings = { ...DEFAULT_SETTINGS };
  private reports = new ReportStore(this.app);
  private rssCache = new RssCacheStore(this.app);
  private feedback = new NewsFeedbackStore(this.app);
  private snapshots = new DigestSnapshotStore(this.app);
  private prefetch?: Prefetch;
  private latest?: DigestResult;
  private busy = false;
  private lastScheduleAttempt = 0;
  private lastSchedulePhase = '';
  private lastTickAt = 0;
  private lastFeedPollAt = 0;
  private feedPollRunning = false;
  private morningObservedDate = '';
  readonly telegram = new TelegramMtproto(this.app, () => this.settings);

  async onload(): Promise<void> {
    const saved = (await this.loadData() ?? {}) as Partial<Omit<InvestSettings, 'llmProvider' | 'telegramProvider'>> & {
      llmProvider?: 'local' | 'cloud' | 'openai'; telegramProvider?: InvestSettings['telegramProvider'] | 'tgstat';
      tgstatSecretId?: string; tgstatToken?: string;
      moexCciLogin?: string; moexCciPasswordSecretId?: string;
      metricsPath?: string;
    };
    const hadCciSettings = 'moexCciLogin' in saved || 'moexCciPasswordSecretId' in saved;
    const hadLegacyMetricsPath = 'metricsPath' in saved;
    delete saved.metricsPath;
    delete saved.moexCciLogin;
    delete saved.moexCciPasswordSecretId;
    delete saved.tgstatSecretId;
    delete saved.tgstatToken;
    this.settings = { ...DEFAULT_SETTINGS, ...saved,
      telegramProvider: saved.telegramProvider === 'tgstat' ? 'public-web' : saved.telegramProvider ?? DEFAULT_SETTINGS.telegramProvider,
      llmProvider: saved.llmProvider === 'openai' ? 'cloud' : saved.llmProvider ?? DEFAULT_SETTINGS.llmProvider };
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(this.settings.digestReadyTime)) this.settings.digestReadyTime = DEFAULT_SETTINGS.digestReadyTime;
    this.settings.outputFolder = REPORT_ROOT;
    let snapshotMigrated = !saved.lastDigest;
    try {
      this.latest = await this.snapshots.load() ?? restoreDigestSnapshot(this.settings.lastDigest);
      if (this.latest && this.settings.lastDigest) await this.snapshots.save(saveDigestSnapshot(this.latest));
      snapshotMigrated = true;
    } catch (error) {
      this.latest = restoreDigestSnapshot(this.settings.lastDigest);
      console.error('Invest Manager: не удалось восстановить снимок отчёта', error);
    }
    if (snapshotMigrated) delete this.settings.lastDigest;
    if (this.latest) await this.reports.upgradeLatestImoex(this.latest);
    this.settings.eiaApiKey = this.settings.eiaSecretId ? this.app.secretStorage.getSecret(this.settings.eiaSecretId) ?? '' : '';
    this.settings.cloudLlmApiKey = this.settings.cloudLlmSecretId ? this.app.secretStorage.getSecret(this.settings.cloudLlmSecretId) ?? '' : '';
    if (hadCciSettings || hadLegacyMetricsPath || (saved.lastDigest && snapshotMigrated)) await this.saveSettings();
    this.addSettingTab(new InvestSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('invest-manager-stock', (source, el) => { renderStockChart(el, source); });
    this.registerMarkdownPostProcessor((el) => { applyCompanyCardColors(el); });
    this.registerMarkdownCodeBlockProcessor('invest-manager-imoex', (source, el) => { renderImoexChart(el, source); });
    this.registerView(INVEST_VIEW_TYPE, (leaf) => new AgentView(leaf, {
      runDigest: () => this.runDigest(false),
      askHelp: (question, history) => this.askHelp(question, history),
      openReport: (path) => this.openReport(path),
      loadLatestReport: async () => {
        const paths = [reportPath(new Date()), this.latest?.reportPath].filter((path): path is string => Boolean(path));
        for (const path of paths) {
          if (!path.startsWith(`${REPORT_ROOT}/`) || !path.endsWith('.md')) continue;
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) return { path, markdown: await this.app.vault.cachedRead(file) };
        }
        return undefined;
      },
      loadFeedback: () => this.feedback.load(),
      rateNews: (news: SelectedNews, rating: NewsRating) => this.feedback.record(news, rating).then(() => undefined),
      markNewsRead: (news: SelectedNews) => this.feedback.markRead(news).then(() => undefined),
    }, this.latest));
    this.addCommand({ id: 'open-agent', name: 'Открыть инвестиционного агента', callback: () => { void this.openAgent(); } });
    this.addRibbonIcon('chart-line', 'Открыть Invest Manager', () => { void this.openAgent(); });
    this.addCommand({ id: 'create-digest', name: 'Создать сводку за 24 часа', callback: () => { void this.runDigest(false); } });
    this.registerInterval(window.setInterval(() => { void this.scheduleTick(); }, 60_000));
    this.registerDomEvent(window, 'focus', () => { void this.scheduleTick(); });
    this.app.workspace.onLayoutReady(() => { void this.scheduleTick(); });
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, lastDigest: undefined, eiaApiKey: '', cloudLlmApiKey: '' });
  }

  onunload(): void {
    void this.telegram.disconnect();
  }

  private view(): AgentView | undefined {
    const active = this.app.workspace.getActiveViewOfType(AgentView);
    if (active) return active;
    return this.app.workspace.getLeavesOfType(INVEST_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .find((view): view is AgentView => view instanceof AgentView);
  }

  private status(message: string, notice = false): void {
    this.view()?.setStatus(message);
    if (notice) new Notice(message, 8000);
  }

  private notifyReady(path: string, issueCount: number): void {
    const fragment = createFragment();
    const card = fragment.createDiv({ cls: 'invest-manager-ready-notice' });
    const heading = card.createDiv({ cls: 'invest-manager-ready-notice__heading' });
    heading.createSpan({ cls: 'invest-manager-ready-notice__icon', text: '✓', attr: { 'aria-hidden': 'true' } });
    heading.createEl('strong', { text: 'Инвестиционная сводка готова' });
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).format(new Date());
    card.createDiv({ cls: 'invest-manager-ready-notice__meta', text: `${time} МСК · отчёт сохранён` });
    if (issueCount > 0) {
      const plural = new Intl.PluralRules('ru-RU').select(issueCount);
      const label = plural === 'one' ? 'ограничение' : plural === 'few' ? 'ограничения' : 'ограничений';
      card.createDiv({ cls: 'invest-manager-ready-notice__issues', text: `⚠ ${issueCount} ${label} — подробности в отчёте` });
    }
    const button = card.createEl('button', { cls: 'mod-cta invest-manager-ready-notice__button', text: 'Открыть отчёт' });
    const notice = new Notice(fragment, 12000);
    button.addEventListener('click', () => {
      notice.hide();
      void this.openReport(path);
    });
  }

  async openAgent(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(INVEST_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: INVEST_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (this.latest) this.view()?.showDigest(this.latest);
  }

  private async askHelp(question: string, history: HelpExchange[]): Promise<string> {
    if (!configuredModel(this.settings)) {
      return 'Для ответа на вопросы настройте локальную или облачную модель в настройках Invest Manager. Список возможностей доступен в окне «Помощь».';
    }
    return completeModel(this.settings, helpSystemPrompt(), buildHelpRequest(question, history, HELP_DOCUMENTS));
  }

  async openReport(path: string): Promise<void> {
    await this.app.workspace.openLinkText(path, '', 'tab');
  }

  async runDigest(automatic: boolean, now = new Date()): Promise<void> {
    if (this.busy) { this.status('Другая задача уже выполняется.', !automatic); return; }
    this.busy = true;
    this.status('');
    this.view()?.setProgress('Собираю новости и рыночные данные…');
    try {
      const config = await loadConfig(this.app, this.settings);
      const feedback = await this.feedback.load();
      const dateKey = moscowDateKey(now);
      const regularMorning = automatic && this.morningObservedDate === dateKey;
      const window = regularMorning ? morningWindow(dateKey, this.settings.digestReadyTime) : recentWindow(now);
      const prefetch = regularMorning && this.prefetch ? { end: this.prefetch.end, news: this.prefetch.news, semanticTopics: this.prefetch.semanticTopics } : undefined;
      const ragContext = await projectRagContext(this.app, config, this.settings);
      const result = await buildDigest(config, this.settings, window.start, window.end, prefetch,
        (channel, start, end) => this.telegram.readChannel(channel, start, end), this.rssCache, feedback,
        readRenderedCompanyPage, ragContext);
      try {
        const reportNews = [...result.world, ...(result.worldBackfill ?? []).flatMap((group) => group.items),
          ...(result.companyNews ?? []).flatMap((group) => [...group.press, ...group.news])];
        result.relatedNotes = await findRelatedNotes(this.app, config, reportPath(now), this.settings.ragEnabled, reportNews);
      } catch (error) {
        result.issues.push({ source: 'Мои заметки',
          message: `Не удалось подобрать ссылки: ${error instanceof Error ? error.message : String(error)}` });
      }
      const markdown = renderDigest(result, config.companies);
      const path = await this.reports.append(now, markdown);
      result.reportPath = path;
      this.latest = result;
      const view = this.view();
      view?.showDigest(result);
      if (view) await view.showReport(markdown, path).catch(() => this.status('Отчёт сохранён, но не удалось показать его во вкладке. Откройте заметку.', true));
      await this.snapshots.save(saveDigestSnapshot(result));
      if (automatic) {
        this.settings.lastAutomaticDate = dateKey;
      }
      await this.saveSettings();
      this.notifyReady(path, result.issues.length);
    } catch (error) {
      this.status(`Не удалось сформировать сводку: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      this.busy = false;
      this.view()?.setProgress('');
    }
  }

  private async scheduleTick(): Promise<void> {
    const now = new Date();
    const due = dueDigest(now, this.settings.digestReadyTime, this.settings.lastAutomaticDate);
    if (this.lastTickAt && Date.now() - this.lastTickAt > 3 * 60_000 && due?.phase === 'run') {
      this.prefetch = undefined;
      this.morningObservedDate = '';
    }
    this.lastTickAt = Date.now();
    if (this.busy) return;
    if (!due) {
      if (Date.now() - this.lastFeedPollAt >= 15 * 60_000) void this.pollFeeds();
      return;
    }
    const schedulePhase = `${due.dateKey}:${due.phase}`;
    if (this.lastSchedulePhase === schedulePhase && Date.now() - this.lastScheduleAttempt < 5 * 60_000) return;
    this.lastScheduleAttempt = Date.now();
    this.lastSchedulePhase = schedulePhase;
    if (due.phase === 'prepare') {
      this.morningObservedDate = due.dateKey;
      if (this.prefetch?.dateKey === due.dateKey && this.prefetch.readyTime === this.settings.digestReadyTime) return;
      this.busy = true;
      this.status('');
      this.view()?.setProgress('Подготавливаю утреннюю сводку…');
      try {
        const config = await loadConfig(this.app, this.settings);
        const feedback = await this.feedback.load();
        const window = morningWindow(due.dateKey, this.settings.digestReadyTime);
        const news = await collectNews(config.companies, config.publications, config.channels, this.settings, window.start, now,
          (channel, start, end) => this.telegram.readChannel(channel, start, end), readRenderedCompanyPage);
        await this.rssCache.update(config.publications, news);
        let semanticTopics: Map<string, string> | undefined;
        try {
          semanticTopics = await prepareNews(this.settings, news, config, feedback);
        } catch (error) {
          news.issues.push({ source: 'Модель', message: error instanceof Error ? error.message : 'Ошибка подготовки' });
        }
        this.prefetch = { dateKey: due.dateKey, readyTime: this.settings.digestReadyTime, end: now, news, semanticTopics };
        this.status(`Предварительные данные собраны. В ${this.settings.digestReadyTime} МСК проверю новые публикации.`);
      } catch (error) {
        this.status(`Подготовка не удалась: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.busy = false;
        this.view()?.setProgress('');
      }
      return;
    }
    await this.runDigest(true, now);
  }

  private async pollFeeds(): Promise<void> {
    if (this.feedPollRunning || this.busy) return;
    this.feedPollRunning = true;
    this.lastFeedPollAt = Date.now();
    try {
      const config = await loadConfig(this.app, this.settings);
      const now = new Date();
      const news = await collectNews([], config.publications, [], this.settings,
        new Date(now.getTime() - 72 * 60 * 60_000), now);
      await this.rssCache.update(config.publications, news, now);
    } catch (error) {
      this.status(`Не удалось обновить историю RSS: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.feedPollRunning = false;
    }
  }
}
