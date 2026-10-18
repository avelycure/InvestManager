import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as setNodeTimeout } from 'node:timers';
import { ElectronStdioClientTransport } from '../src/electron-stdio-transport.ts';

void test('MCP transport closes when the renderer timer returns a number', async () => {
  const transport = new ElectronStdioClientTransport({ command: process.execPath,
    args: ['-e', 'process.stdin.resume()'], stderr: 'pipe' });
  await transport.start();
  const timerHost = global;
  const original = timerHost.setTimeout;
  timerHost.setTimeout = ((callback: (...args: unknown[]) => void, delay: number) => {
    const timer = setNodeTimeout(callback, delay);
    timer.unref();
    return 1;
  }) as typeof timerHost.setTimeout;
  try {
    await transport.close();
    assert.equal(transport.pid, null);
  } finally {
    timerHost.setTimeout = original;
    await transport.close();
  }
});
