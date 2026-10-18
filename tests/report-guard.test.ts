import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertNoSymlink } from '../src/report-guard.ts';

void test('rejects report paths redirected through a symbolic link', async () => {
  const base = await mkdtemp(join(tmpdir(), 'invest-report-'));
  try {
    const outside = join(base, 'outside');
    await mkdir(outside);
    await symlink(outside, join(base, 'Статистика'));
    await assert.rejects(assertNoSymlink(base, 'Статистика/2026/10/2026-10-17.md'), /символическую ссылку/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
