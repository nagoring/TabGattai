/**
 * Mutual exclusion for read-modify-write of the store.
 *
 * Uses the Web Locks API, which is shared by every context of the extension origin
 * (service worker + manager pages), so concurrent saves from the background and edits from
 * one or more manager tabs are serialized. Falls back to an in-process queue where the API is
 * unavailable (unit tests).
 */
const queues = new Map<string, Promise<unknown>>();

function localLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(name) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  queues.set(name, tail);
  void tail.then(() => {
    if (queues.get(name) === tail) queues.delete(name);
  });
  return run;
}

export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(name, fn) as Promise<T>;
  }
  return localLock(name, fn);
}
