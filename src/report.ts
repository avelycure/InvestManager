import { App, FileSystemAdapter, TFile, TFolder } from 'obsidian';
import { legacyReportPath, reportPath } from './report-path';
import { assertNoSymlink } from './report-guard';
import { linkPreviousStockReportEmbeds, removeLegacyIfrsSections, removeLegacyPeRows, removeStandaloneCompanyMetrics, retirePreviousImoexCharts, retirePreviousStockCharts, stockChartTickers, upgradeLatestImoexChart } from './report-sections';
import { imoexChartBlock } from './report-render';
import type { DigestResult } from './types';
export { renderDigest } from './report-render';

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const found = app.vault.getAbstractFileByPath(current);
    if (found && !(found instanceof TFolder)) throw new Error(`«${current}» — файл, ожидалась папка`);
    if (!found) await app.vault.createFolder(current);
  }
}

export class ReportStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private app: App) {}

  async upgradeLatestImoex(result: DigestResult): Promise<void> {
    if (!result.reportPath || !result.imoex) return;
    const path = result.reportPath;
    if (!/^Статистика\/\d{4}\/[^/]+\/[^/]+\.md$/.test(path)) return;
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) return;
    await assertNoSymlink(this.app.vault.adapter.getBasePath(), path);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const block = imoexChartBlock(result.imoex, result.windowEnd);
    const current = await this.app.vault.cachedRead(file);
    if (upgradeLatestImoexChart(current, block) === current) return;
    await this.app.vault.process(file, (content) => upgradeLatestImoexChart(content, block));
  }

  async chartAssetPath(date: Date, svg: string, preferredPath: string): Promise<string> {
    const notePath = reportPath(date);
    const folderPath = notePath.slice(0, notePath.lastIndexOf('/'));
    if (!preferredPath.startsWith(`${folderPath}/IMOEX-`) || !preferredPath.endsWith('.svg')) throw new Error('Некорректный путь графика IMOEX');
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) throw new Error('Для графика требуется локальное хранилище Obsidian');
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return preferredPath;
    for (const file of folder.children) {
      if (!(file instanceof TFile) || !/^IMOEX-[A-Za-z0-9-]+\.svg$/.test(file.name)) continue;
      await assertNoSymlink(this.app.vault.adapter.getBasePath(), file.path);
      if (await this.app.vault.read(file) === svg) return file.path;
    }
    return preferredPath;
  }

  append(date: Date, markdown: string, asset?: { path: string; svg: string } | { path: string; svg: string }[]): Promise<string> {
    const work = async (): Promise<string> => {
      const path = reportPath(date);
      const legacyPath = legacyReportPath(date);
      const folder = path.slice(0, path.lastIndexOf('/'));
      if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
        throw new Error('Для записи отчёта требуется локальное хранилище Obsidian');
      }
      const basePath = this.app.vault.adapter.getBasePath();
      await assertNoSymlink(basePath, path);
      await assertNoSymlink(basePath, legacyPath);
      await ensureFolder(this.app, folder);
      await assertNoSymlink(basePath, path);
      const assets = asset ? (Array.isArray(asset) ? asset : [asset]) : [];
      for (const chart of assets) {
        const filename = chart.path.slice(folder.length + 1);
        if (!chart.path.startsWith(`${folder}/`) || !/^(?:IMOEX-\d{8}-[0-9a-f]{8}|STOCK-[A-Z0-9._-]{1,24}-\d{8}-[0-9a-f]{8})\.svg$/.test(filename)) {
          throw new Error('График можно сохранить только рядом с отчётом в «Статистике»');
        }
        await assertNoSymlink(basePath, chart.path);
        const existingAsset = this.app.vault.getAbstractFileByPath(chart.path);
        if (existingAsset && !(existingAsset instanceof TFile)) throw new Error('Путь графика занят папкой');
        if (existingAsset instanceof TFile) {
          if (await this.app.vault.read(existingAsset) !== chart.svg) throw new Error('График с таким именем уже существует');
        } else await this.app.vault.create(chart.path, chart.svg);
      }
      let existing = this.app.vault.getAbstractFileByPath(path);
      if (existing && !(existing instanceof TFile)) throw new Error(`«${path}» — папка, ожидался файл`);
      if (!existing) {
        const legacy = this.app.vault.getAbstractFileByPath(legacyPath);
        if (legacy && !(legacy instanceof TFile)) throw new Error(`«${legacyPath}» — папка, ожидался файл`);
        if (legacy instanceof TFile) {
          await this.app.vault.rename(legacy, path);
          existing = legacy;
        }
      }
      if (existing instanceof TFile) {
        await this.app.vault.process(existing, (content) => {
          const tickers = stockChartTickers(markdown);
          for (const chart of assets) {
            const ticker = /^STOCK-([A-Z0-9._-]{1,24})-\d{8}-[0-9a-f]{8}\.svg$/.exec(chart.path.slice(folder.length + 1))?.[1];
            if (ticker) tickers.add(ticker);
          }
          const previous = removeStandaloneCompanyMetrics(removeLegacyIfrsSections(removeLegacyPeRows(linkPreviousStockReportEmbeds(retirePreviousStockCharts(retirePreviousImoexCharts(content)), tickers))));
          return `${previous ? `${previous.trimEnd()}\n\n` : ''}${markdown.trim()}\n`;
        });
      } else {
        await this.app.vault.create(path, `${markdown.trim()}\n`);
      }
      return path;
    };
    const result = this.pending.then(work);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
}
