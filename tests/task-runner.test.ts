import assert from 'node:assert/strict';
import test from 'node:test';
import { runTasks, sourceConcurrency } from '../src/task-runner.ts';

void test('local mode waits for each source before starting the next', async () => {
  const events: string[] = [];
  const tasks = [1, 2, 3].map((id) => async () => {
    events.push(`start ${id}`);
    await Promise.resolve();
    events.push(`end ${id}`);
    return id;
  });
  assert.deepEqual(await runTasks(tasks, sourceConcurrency('local')), [1, 2, 3]);
  assert.deepEqual(events, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
});

void test('cloud mode overlaps sources but respects its concurrency limit', async () => {
  const releases: (() => void)[] = [];
  let active = 0;
  let maximum = 0;
  const tasks = Array.from({ length: 6 }, (_, id) => async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => { releases.push(resolve); });
    active--;
    return id;
  });
  const result = runTasks(tasks, sourceConcurrency('cloud'));
  assert.equal(active, 4);
  for (let id = 0; id < tasks.length; id++) {
    releases[id]?.();
    await Promise.resolve();
  }
  assert.deepEqual(await result, [0, 1, 2, 3, 4, 5]);
  assert.equal(maximum, 4);
});
