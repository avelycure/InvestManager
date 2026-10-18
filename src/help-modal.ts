import { App, Component, MarkdownRenderer, Modal } from 'obsidian';
import { helpOverview, parseHelpCommand, type HelpExchange } from './help';

export class HelpModal extends Modal {
  private input?: HTMLTextAreaElement;
  private submit?: HTMLButtonElement;
  private messages?: HTMLElement;
  private components: Component[] = [];
  private history: HelpExchange[] = [];
  private closed = false;
  private busy = false;

  constructor(app: App, private askHelp: (question: string, history: HelpExchange[]) => Promise<string>) { super(app); }

  onOpen(): void {
    this.closed = false;
    this.setTitle('Помощь');
    this.modalEl.addClass('invest-manager-assistant-help-modal');
    const root = this.contentEl;
    root.empty();
    root.createEl('p', { cls: 'invest-manager-assistant-help__intro',
      text: 'Спросите о возможностях и настройках плагина.' });
    this.messages = root.createDiv({ cls: 'invest-manager-assistant-help__messages',
      attr: { role: 'log', 'aria-label': 'Переписка с помощником', 'aria-live': 'polite', 'aria-relevant': 'additions text' } });
    const form = root.createEl('form', { cls: 'invest-manager-assistant-help__form' });
    this.input = form.createEl('textarea', { attr: {
      rows: '2', maxlength: '2000', placeholder: 'Например, как подключить Telegram?',
      'aria-label': 'Вопрос о плагине',
    } });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    this.submit = form.createEl('button', { text: 'Отправить', cls: 'mod-cta', attr: { type: 'submit' } });
    form.addEventListener('submit', (event) => { event.preventDefault(); void this.sendQuestion(); });
    root.createEl('p', { cls: 'invest-manager-assistant-help__hint',
      text: 'При облачной модели вопросы и выдержки из документации отправляются выбранному провайдеру.' });
    void this.addAssistantMessage(helpOverview());
    this.input.focus();
  }

  onClose(): void {
    this.closed = true;
    for (const component of this.components) component.unload();
    this.components = [];
    this.history = [];
    this.messages = undefined;
    this.input = undefined;
    this.submit = undefined;
    this.contentEl.empty();
  }

  private async sendQuestion(): Promise<void> {
    if (this.busy || !this.input) return;
    const raw = this.input.value.trim();
    const question = parseHelpCommand(raw)?.question ?? raw;
    if (!question) return;
    this.input.value = '';
    this.addMessage('user', question);
    this.busy = true;
    this.input.disabled = true;
    if (this.submit) this.submit.disabled = true;
    const pending = this.addMessage('assistant', 'Ищу ответ в документации проекта…');
    pending.addClass('is-pending');
    try {
      const answer = await this.askHelp(question, [...this.history]);
      if (this.closed) return;
      pending.remove();
      await this.addAssistantMessage(answer);
      this.history.push({ question, answer });
    } catch (error) {
      if (this.closed) return;
      pending.remove();
      await this.addAssistantMessage(`Не удалось ответить: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
      if (!this.closed) {
        if (this.input) { this.input.disabled = false; this.input.focus(); }
        if (this.submit) this.submit.disabled = false;
      }
    }
  }

  private addMessage(role: 'assistant' | 'user', text: string): HTMLElement {
    const message = this.messages!.createDiv({ cls: `invest-manager-assistant-help__message is-${role}` });
    message.createDiv({ cls: 'invest-manager-assistant-help__speaker',
      text: role === 'assistant' ? 'Invest Manager' : 'Вы' });
    message.createDiv({ cls: 'invest-manager-assistant-help__bubble', text });
    this.scrollToLatest();
    return message;
  }

  private async addAssistantMessage(markdown: string): Promise<void> {
    if (this.closed || !this.messages) return;
    const message = this.addMessage('assistant', '');
    const bubble = message.querySelector<HTMLElement>('.invest-manager-assistant-help__bubble')!;
    bubble.addClass('markdown-rendered');
    const component = new Component();
    component.load();
    this.components.push(component);
    await MarkdownRenderer.render(this.app, markdown, bubble, '', component);
    if (!this.closed) this.scrollToLatest();
  }

  private scrollToLatest(): void {
    if (this.messages) this.messages.scrollTop = this.messages.scrollHeight;
  }
}
