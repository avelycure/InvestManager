import { App, FileSystemAdapter, TFile, TFolder } from 'obsidian';
import { CONFIG_TEMPLATES } from './config-templates';
import { assertNoSymlink } from './report-guard';
import { REPORT_ROOT } from './report-path';

export async function initializeConfigFiles(app: App): Promise<{ created: number; existing: number }> {
  if (!(app.vault.adapter instanceof FileSystemAdapter)) {
    throw new Error('Инициализация требует локальное хранилище Obsidian');
  }
  const basePath = app.vault.adapter.getBasePath();
  const root = app.vault.getAbstractFileByPath(REPORT_ROOT);
  if (root && !(root instanceof TFolder)) throw new Error(`«${REPORT_ROOT}» — файл, ожидалась папка`);

  for (const template of CONFIG_TEMPLATES) {
    await assertNoSymlink(basePath, template.path);
    const current = app.vault.getAbstractFileByPath(template.path);
    if (current && !(current instanceof TFile)) throw new Error(`«${template.path}» — папка, ожидался файл`);
  }

  if (!root) await app.vault.createFolder(REPORT_ROOT);
  let created = 0;
  let existing = 0;
  for (const template of CONFIG_TEMPLATES) {
    await assertNoSymlink(basePath, template.path);
    if (app.vault.getAbstractFileByPath(template.path)) {
      existing++;
      continue;
    }
    await app.vault.create(template.path, `${template.markdown}\n`);
    created++;
  }
  return { created, existing };
}
