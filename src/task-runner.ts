/** Run independent jobs with a fixed concurrency limit, preserving result order. */
export async function runTasks<T>(tasks: readonly (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Некорректный предел параллельных запросов');
  const results: T[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(tasks.length, concurrency) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  });
  await Promise.all(workers);
  return results;
}

export function sourceConcurrency(provider: 'local' | 'cloud'): number {
  return provider === 'cloud' ? 4 : 1;
}
