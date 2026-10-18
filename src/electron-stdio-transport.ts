import type { ChildProcess } from 'node:child_process';
import { clearTimeout as clearNodeTimeout, setTimeout as setNodeTimeout } from 'node:timers';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function running(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function waitForClose(child: ChildProcess, milliseconds: number): Promise<void> {
  if (!running(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearNodeTimeout(timer);
      child.off('close', finish);
      resolve();
    };
    const timer = setNodeTimeout(finish, milliseconds);
    timer.unref();
    child.once('close', finish);
  });
}

/** SDK v1 uses the renderer's numeric setTimeout result as a Node timer during close. */
export class ElectronStdioClientTransport extends StdioClientTransport {
  override async close(): Promise<void> {
    // The SDK has no public child-process handle; keep this scoped to its pinned v1 transport.
    const internals = this as unknown as { _process?: ChildProcess };
    const child = internals._process;
    if (!child) {
      if (this.pid !== null) throw new Error('Playwright MCP: несовместимая версия транспорта SDK');
      await super.close();
      return;
    }
    internals._process = undefined;
    try { child.stdin?.end(); } catch { /* The child may already have exited. */ }
    await waitForClose(child, 2_000);
    if (running(child)) {
      try { child.kill('SIGTERM'); } catch { /* Continue to the final attempt. */ }
      await waitForClose(child, 2_000);
    }
    if (running(child)) {
      try { child.kill('SIGKILL'); } catch { /* The process may have exited. */ }
    }
    await super.close();
  }
}
