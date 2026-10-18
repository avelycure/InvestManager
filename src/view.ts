import { Component, ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import { latestReportSection } from './report-sections';
import type { DigestResult, NewsFeedback, NewsRating, SelectedNews } from './types';

export const INVEST_VIEW_TYPE = 'invest-manager-agent';

export interface AgentActions {
  runDigest(): Promise<void>;
  openReport(path: string): Promise<void>;
  loadLatestReport(): Promise<{ path: string; markdown: string } | undefined>;
  loadFeedback(): Promise<NewsFeedback[]>;
  rateNews(news: SelectedNews, rating: NewsRating): Promise<void>;
  markNewsRead(news: SelectedNews): Promise<void>;
}

export class AgentView extends ItemView {
  private statusEl?: HTMLElement;
  private reportEl?: HTMLElement;
  private reportBody?: HTMLElement;
  private renderComponent?: Component;
  private renderVersion = 0;
  private renderQueue: Promise<void> = Promise.resolve();
  private actionButtons: HTMLButtonElement[] = [];
  private current?: DigestResult;

  constructor(leaf: WorkspaceLeaf, private actions: AgentActions, latest?: DigestResult) {
    super(leaf);
    this.current = latest;
  }

  getViewType(): string { return INVEST_VIEW_TYPE; }
  getDisplayText(): string { return 'Инвестиционный агент'; }
  getIcon(): string { return 'chart-line'; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('invest-manager-view');
    root.createEl('h1', { text: 'Invest Manager' });
    const actions = root.createDiv({ cls: 'invest-manager-actions' });
    const digest = actions.createDiv({ cls: 'invest-manager-action-card' });
    digest.createEl('h2', { text: 'Ежедневная сводка' });
    digest.createEl('p', { text: 'Новости, рынок, ставки, график IMOEX, графики и капитализация компаний.' });
    const controls = digest.createDiv({ cls: 'invest-manager-action-controls' });
    const digestButton = controls.createEl('button', { text: 'Сформировать сводку', cls: 'mod-cta invest-manager-action-button' });
    this.registerDomEvent(digestButton, 'click', () => { void this.runAction(() => this.actions.runDigest()); });
    this.reportEl = controls.createDiv({ cls: 'invest-manager-report-link' });

    this.actionButtons = [digestButton];
    this.statusEl = root.createDiv({ cls: 'invest-manager-status' });
    this.statusEl.hidden = true;
    this.reportBody = root.createDiv({ cls: 'invest-manager-report markdown-rendered' });
    this.reportBody.setText('Отчёт появится здесь после формирования.');
    if (this.current) this.showDigest(this.current);
    void this.restoreReport();
  }

  private async runAction(action: () => Promise<void>): Promise<void> {
    for (const button of this.actionButtons) button.disabled = true;
    try { await action(); }
    finally {
      for (const button of this.actionButtons) button.disabled = false;
    }
  }

  setStatus(message: string): void {
    if (!this.statusEl) return;
    this.statusEl.setText(message);
    this.statusEl.hidden = !message;
  }

  setReport(path: string): void {
    if (!this.reportEl) return;
    this.reportEl.empty();
    const button = this.reportEl.createEl('button', { text: 'Открыть последний отчёт', attr: { title: path } });
    this.registerDomEvent(button, 'click', () => { void this.actions.openReport(path); });
  }

  private async restoreReport(): Promise<void> {
    const version = ++this.renderVersion;
    try {
      const latest = await this.actions.loadLatestReport();
      if (version === this.renderVersion && latest) {
        this.setReport(latest.path);
        await this.queueReport(latestReportSection(latest.markdown), latest.path, version);
      }
    } catch (error) {
      if (version === this.renderVersion) this.reportBody?.setText(error instanceof Error ? error.message : 'Не удалось открыть последний отчёт');
    }
  }

  async showReport(markdown: string, path: string): Promise<void> {
    const version = ++this.renderVersion;
    this.setReport(path);
    await this.queueReport(markdown, path, version);
  }

  private queueReport(markdown: string, path: string, version: number): Promise<void> {
    const work = this.renderQueue.then(async () => {
      if (version === this.renderVersion) await this.renderReport(markdown, path);
    });
    this.renderQueue = work.then(() => undefined, () => undefined);
    return work;
  }

  private async renderReport(markdown: string, path: string): Promise<void> {
    if (!this.reportBody) return;
    if (this.renderComponent) this.removeChild(this.renderComponent);
    this.reportBody.empty();
    const component = this.addChild(new Component());
    this.renderComponent = component;
    await MarkdownRenderer.render(this.app, markdown, this.reportBody, path, component);
    await this.attachRatings();
  }

  private async attachRatings(): Promise<void> {
    if (!this.reportBody || !this.current) return;
    const feedback = await this.actions.loadFeedback();
    const news = [...this.current.world, ...this.current.companies,
      ...(this.current.companyNews?.flatMap((group) => [...group.press, ...group.news]) ?? []),
      ...(this.current.worldBackfill?.flatMap((group) => group.items) ?? [])];
    const unique = new Map(news.map((item) => [`${item.url}\u0000${item.topic ?? ''}`, item]));
    const anchors = Array.from(this.reportBody.querySelectorAll<HTMLAnchorElement>('a[href]'));
    for (const item of unique.values()) {
      const link = anchors.find((anchor) => anchor.href === item.url);
      const row = link?.closest<HTMLElement>('li, tr');
      if (!row || row.querySelector('.invest-manager-rating')) continue;
      let target: HTMLElement;
      if (row.matches('tr')) {
        const header = row.closest('table')?.querySelector<HTMLElement>('thead tr');
        if (header && !header.querySelector('.invest-manager-rating-header')) {
          header.createEl('th', { cls: 'invest-manager-rating-header', text: 'Действия' });
        }
        target = row.createEl('td', { cls: 'invest-manager-rating-cell' });
      } else {
        row.classList.add('invest-manager-rated-news');
        target = row;
      }
      const controls = target.createDiv({ cls: 'invest-manager-rating' });
      const choices: Array<[NewsRating, string, string]> = [
        ['helpful', 'thumbs-up', 'Полезно'],
        ['off-topic', 'circle-x', 'Не по теме'],
        ['not-interesting', 'eye-off', 'Неинтересно'],
      ];
      const buttons = choices.map(([rating, icon, label]) => {
        const button = controls.createEl('button', { cls: 'invest-manager-rating__button',
          attr: { type: 'button', title: label, 'aria-label': `${label}: ${item.title}`, 'aria-pressed': 'false' } });
        setIcon(button, icon);
        this.registerDomEvent(button, 'click', async () => {
          buttons.forEach((other) => { other.disabled = true; });
          try {
            await this.actions.rateNews(item, rating);
            buttons.forEach((other, index) => { other.setAttribute('aria-pressed', String(choices[index]?.[0] === rating)); });
            new Notice('Оценка сохранена и повлияет на следующие сводки', 4000);
          } catch (error) {
            new Notice(`Не удалось сохранить оценку: ${error instanceof Error ? error.message : String(error)}`, 6000);
          } finally { buttons.forEach((other) => { other.disabled = false; }); }
        });
        return button;
      });
      const saved = feedback.find((entry) => entry.url === item.url && entry.topic === item.topic)?.rating;
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(choices[index]?.[0] === saved)));
      const readButton = controls.createEl('button', { cls: 'invest-manager-rating__button',
        attr: { type: 'button', title: 'Пометить прочитанным', 'aria-label': `Пометить прочитанным: ${item.title}`,
          'aria-pressed': String(feedback.some((entry) => entry.url === item.url && entry.readAt)) } });
      setIcon(readButton, 'check-check');
      this.registerDomEvent(readButton, 'click', async () => {
        readButton.disabled = true;
        try {
          await this.actions.markNewsRead(item);
          readButton.setAttribute('aria-pressed', 'true');
          new Notice('Прочитано — новость не попадёт в следующие сводки', 4000);
        } catch (error) {
          new Notice(`Не удалось сохранить отметку: ${error instanceof Error ? error.message : String(error)}`, 6000);
        } finally { readButton.disabled = false; }
      });
    }
  }

  showDigest(result: DigestResult): void {
    this.current = result;
    this.setStatus('');
    if (result.reportPath) this.setReport(result.reportPath);
  }
}
