import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

export async function assertNoSymlink(basePath: string, reportPath: string): Promise<void> {
  let current = basePath;
  for (const part of reportPath.split('/')) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`Запись через символическую ссылку запрещена: ${reportPath}`);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}
