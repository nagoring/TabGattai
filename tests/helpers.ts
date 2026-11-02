import type { BrowserTab, TabsApi } from '../src/core/services';
import { Store, type StorageBackend } from '../src/core/storage';
import type { SavedTab, TabGroup } from '../src/core/types';

/** In-memory chrome.storage.local substitute. Values are deep-copied like real storage (JSON). */
export class MemoryBackend implements StorageBackend {
  data = new Map<string, string>();
  failNextWrites = 0;
  writes = 0;
  async get(key: string) {
    const v = this.data.get(key);
    return v === undefined ? undefined : JSON.parse(v);
  }
  async set(key: string, value: unknown) {
    await Promise.resolve();
    if (this.failNextWrites > 0) {
      this.failNextWrites--;
      throw new Error('QUOTA_BYTES quota exceeded');
    }
    this.writes++;
    this.data.set(key, JSON.stringify(value));
  }
}

export function newStore(backend = new MemoryBackend()) {
  return { backend, store: new Store(backend) };
}

/** Fake chrome.tabs for one or more windows. */
export class FakeTabs implements TabsApi {
  windows = new Map<number, BrowserTab[]>();
  closed: number[] = [];
  opened: { url: string; active: boolean }[] = [];
  failOpen = new Set<string>();
  events: string[] = [];
  private nextId = 1;

  addWindow(windowId: number, tabs: Partial<BrowserTab>[]) {
    this.windows.set(
      windowId,
      tabs.map((t, i) => ({ id: this.nextId++, index: i, pinned: false, incognito: false, title: `T${i}`, ...t })),
    );
  }
  async queryWindow(windowId: number) {
    await Promise.resolve();
    return (this.windows.get(windowId) ?? []).map((t) => ({ ...t }));
  }
  async close(ids: number[]) {
    this.events.push('close');
    this.closed.push(...ids);
    for (const [w, tabs] of this.windows) this.windows.set(w, tabs.filter((t) => !ids.includes(t.id!)));
  }
  async open(url: string, o: { active: boolean }) {
    await Promise.resolve();
    if (this.failOpen.has(url)) throw new Error('cannot open');
    this.opened.push({ url, active: o.active });
  }
}

let seq = 0;
export function tab(url: string, title = url, savedAt = 0): SavedTab {
  return { id: `t${++seq}`, url, title, savedAt };
}
export function group(id: string, createdAt: number, urls: string[], name = ''): TabGroup {
  return { id, name, createdAt, tabs: urls.map((u) => tab(u, u, createdAt)) };
}
export const urlsOf = (g: TabGroup | undefined) => (g ? g.tabs.map((t) => t.url) : []);
