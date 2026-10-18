import { App, FileSystemAdapter } from 'obsidian';
import { assertNoSymlink } from './report-guard';
import { REPORT_ROOT } from './report-path';
import { restoreDigestSnapshot } from './snapshot';
import type { DigestResult, SavedDigest } from './types';

const FOLDER = `${REPORT_ROOT}/.invest-manager`;
export const SNAPSHOT_PATH = `${FOLDER}/last-digest.json`;
const MAX_BYTES = 5_000_000;

export class DigestSnapshotStore {
  constructor(private app: App) {}

  private adapter(): FileSystemAdapter {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) throw new Error('Снимок отчёта требует локальное хранилище Obsidian');
    return this.app.vault.adapter;
  }

  async load(): Promise<DigestResult | undefined> {
    const adapter = this.adapter();
    await assertNoSymlink(adapter.getBasePath(), SNAPSHOT_PATH);
    if (!(await adapter.exists(SNAPSHOT_PATH))) return undefined;
    const content = await adapter.read(SNAPSHOT_PATH);
    if (content.length > MAX_BYTES) throw new Error('Снимок отчёта слишком велик');
    return restoreDigestSnapshot(JSON.parse(content) as SavedDigest);
  }

  async save(snapshot: SavedDigest | undefined): Promise<void> {
    if (!snapshot) return;
    const content = JSON.stringify(snapshot);
    if (content.length > MAX_BYTES) throw new Error('Снимок отчёта слишком велик');
    const adapter = this.adapter();
    await assertNoSymlink(adapter.getBasePath(), SNAPSHOT_PATH);
    for (const path of [REPORT_ROOT, FOLDER]) if (!(await adapter.exists(path))) await adapter.mkdir(path);
    await assertNoSymlink(adapter.getBasePath(), SNAPSHOT_PATH);
    await adapter.write(SNAPSHOT_PATH, content);
  }
}
