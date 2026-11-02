import { restoreGroup, restoreTabs, saveWindow, updateSettings, deleteGroup, deleteTab, renameGroup } from '../src/core/services';
import { Store, STORAGE_KEY } from '../src/core/storage';
import { FakeTabs, MemoryBackend, newStore, urlsOf } from './helpers';

const OWN = 'chrome-extension://abcdefgh/manager.html';
const W = 1;

describe('saveWindow', () => {
  it('saves a single tab and closes it', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/', title: 'A' }]);
    const r = await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN, now: 1000 });
    expect(r.status).toBe('saved');
    const data = await store.read();
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]!.tabs[0]).toMatchObject({ url: 'https://a.com/', title: 'A', savedAt: 1000 });
    expect(data.groups[0]!.createdAt).toBe(1000);
    expect(tabs.closed).toHaveLength(1);
  });

  it('saves 100 tabs at once', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, Array.from({ length: 100 }, (_, i) => ({ url: `https://e.com/${i}` })));
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN });
    const data = await store.read();
    expect(data.groups[0]!.tabs).toHaveLength(100);
    expect(urlsOf(data.groups[0])[99]).toBe('https://e.com/99');
    expect(tabs.closed).toHaveLength(100);
  });

  it('skips protected pages, pinned tabs, incognito and its own page; they are not closed', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [
      { url: 'chrome://settings' },
      { url: 'https://ok.com/' },
      { url: 'https://pinned.com/', pinned: true },
      { url: OWN },
      { url: `${OWN}?notice=saved` },
      { url: 'about:blank' },
      { url: 'https://private.com/', incognito: true },
      { url: '', pendingUrl: 'https://loading.com/' },
    ]);
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN });
    const data = await store.read();
    expect(urlsOf(data.groups[0])).toEqual(['https://ok.com/', 'https://loading.com/']);
    expect(tabs.closed).toHaveLength(2);
    expect(tabs.windows.get(W)!.map((t) => t.url)).toEqual(['chrome://settings', 'https://pinned.com/', OWN, `${OWN}?notice=saved`, 'about:blank', 'https://private.com/']);
  });

  it('includes pinned tabs when the setting is on', async () => {
    const { store } = newStore();
    await updateSettings(store, { includePinned: true });
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://pinned.com/', pinned: true }]);
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN });
    expect(urlsOf((await store.read()).groups[0])).toEqual(['https://pinned.com/']);
  });

  it('returns "empty" and creates no group when nothing can be saved', async () => {
    const { store, backend } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'chrome://newtab' }]);
    const r = await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN });
    expect(r.status).toBe('empty');
    expect(backend.writes).toBe(0);
    expect(tabs.closed).toEqual([]);
  });

  it('same URL twice in the window: stored once, right-most tab (processed last) wins, both closed', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [
      { url: 'https://a.com/', title: 'left' },
      { url: 'https://b.com/' },
      { url: 'https://a.com/', title: 'right' },
    ]);
    // Return tabs out of order to prove ordering uses the tab index, not query order.
    const original = tabs.queryWindow.bind(tabs);
    tabs.queryWindow = async (w) => (await original(w)).reverse();
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN });
    const g = (await store.read()).groups[0]!;
    expect(g.tabs.map((t) => t.title)).toEqual(['T1', 'right']);
    expect(tabs.closed).toHaveLength(3);
  });

  it('moves duplicates from older groups (end-to-end)', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://e.com/a' }, { url: 'https://e.com/b' }, { url: 'https://e.com/c' }]);
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN, now: 1 });
    tabs.addWindow(W, [{ url: 'https://e.com/b' }, { url: 'https://e.com/d' }]);
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN, now: 2 });
    const data = await store.read();
    expect(data.groups.map(urlsOf)).toEqual([
      ['https://e.com/b', 'https://e.com/d'],
      ['https://e.com/a', 'https://e.com/c'],
    ]);
  });

  it('does NOT close tabs when the write fails', async () => {
    const { store, backend } = newStore();
    backend.failNextWrites = 1;
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/' }]);
    let opened = false;
    await expect(
      saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN, beforeClose: async () => void (opened = true) }),
    ).rejects.toThrow(/write/);
    expect(tabs.closed).toEqual([]);
    expect(opened).toBe(false);
    expect((await store.read()).groups).toEqual([]);
  });

  it('does NOT close tabs when the write cannot be verified', async () => {
    const backend = new MemoryBackend();
    backend.set = async () => undefined; // silently drops the write
    const store = new Store(backend);
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/' }]);
    await expect(saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN })).rejects.toThrow(/verified/);
    expect(tabs.closed).toEqual([]);
  });

  it('opens the manager (beforeClose) after writing and before closing tabs', async () => {
    const { store, backend } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/' }]);
    await saveWindow(store, tabs, {
      windowId: W,
      ownPagePrefix: OWN,
      beforeClose: async () => {
        tabs.events.push(`manager(writes=${backend.writes})`);
      },
    });
    expect(tabs.events).toEqual(['manager(writes=1)', 'close']);
  });

  it('concurrent saves do not lose data nor save the same tabs twice', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(1, [{ url: 'https://w1.com/a' }, { url: 'https://shared.com/' }]);
    tabs.addWindow(2, [{ url: 'https://w2.com/a' }, { url: 'https://shared.com/' }]);
    const results = await Promise.all([
      saveWindow(store, tabs, { windowId: 1, ownPagePrefix: OWN, now: 1 }),
      saveWindow(store, tabs, { windowId: 2, ownPagePrefix: OWN, now: 2 }),
      saveWindow(store, tabs, { windowId: 1, ownPagePrefix: OWN, now: 3 }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['saved', 'saved', 'empty']);
    const data = await store.read();
    expect(data.revision).toBe(2);
    expect(data.groups.map(urlsOf)).toEqual([['https://w2.com/a', 'https://shared.com/'], ['https://w1.com/a']]);
  });

  it('concurrent edits from another context are serialized with saving', async () => {
    const { store } = newStore();
    await updateSettings(store, { language: 'en' });
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/' }]);
    await Promise.all([
      saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN }),
      updateSettings(store, { theme: 'dark' }),
      updateSettings(store, { removeOnRestore: false }),
    ]);
    const data = await store.read();
    expect(data.groups).toHaveLength(1);
    expect(data.settings).toMatchObject({ language: 'en', theme: 'dark', removeOnRestore: false });
  });

  it('data survives a browser restart (new Store over the same storage)', async () => {
    const backend = new MemoryBackend();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/' }]);
    await saveWindow(new Store(backend), tabs, { windowId: W, ownPagePrefix: OWN });
    // "restart": nothing kept in memory except chrome.storage.local
    const reopened = new Store(backend);
    expect(urlsOf((await reopened.read()).groups[0])).toEqual(['https://a.com/']);
    expect(backend.data.has(STORAGE_KEY)).toBe(true);
  });
});

describe('restore', () => {
  async function seeded(urls: string[]) {
    const env = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, urls.map((url) => ({ url })));
    await saveWindow(env.store, tabs, { windowId: W, ownPagePrefix: OWN });
    tabs.opened = [];
    return { ...env, tabs };
  }

  it('individual restore opens the URL and removes it from the list', async () => {
    const { store, tabs } = await seeded(['https://a.com/', 'https://b.com/']);
    const t = (await store.read()).groups[0]!.tabs[0]!;
    const r = await restoreTabs(store, tabs, [t.id], { activateFirst: true });
    expect(r.opened).toEqual([t.id]);
    expect(tabs.opened).toEqual([{ url: 'https://a.com/', active: true }]);
    expect(urlsOf((await store.read()).groups[0])).toEqual(['https://b.com/']);
  });

  it('group restore opens all and deletes the group', async () => {
    const { store, tabs } = await seeded(['https://a.com/', 'https://b.com/', 'https://c.com/']);
    const g = (await store.read()).groups[0]!;
    const r = await restoreGroup(store, tabs, g);
    expect(r.opened).toHaveLength(3);
    expect(tabs.opened.map((o) => o.url)).toEqual(['https://a.com/', 'https://b.com/', 'https://c.com/']);
    expect((await store.read()).groups).toEqual([]);
  });

  it('partial failure: failed tabs stay in the data', async () => {
    const { store, tabs } = await seeded(['https://a.com/', 'https://b.com/', 'https://c.com/']);
    tabs.failOpen.add('https://b.com/');
    const g = (await store.read()).groups[0]!;
    const r = await restoreGroup(store, tabs, g);
    expect(r.opened).toHaveLength(2);
    expect(r.failed).toHaveLength(1);
    expect(urlsOf((await store.read()).groups[0])).toEqual(['https://b.com/']);
  });

  it('refuses dangerous schemes even if they got into storage', async () => {
    const { store, backend } = newStore();
    await backend.set(STORAGE_KEY, {
      schemaVersion: 1,
      revision: 1,
      settings: {},
      groups: [{ id: 'g', name: '', createdAt: 1, tabs: [{ id: 'x', url: 'javascript:alert(1)', title: 'x', savedAt: 1 }] }],
    });
    const tabs = new FakeTabs();
    const r = await restoreTabs(store, tabs, ['x']);
    expect(r.failed).toEqual(['x']);
    expect(tabs.opened).toEqual([]);
  });

  it('keeps data when "remove on restore" is off', async () => {
    const { store, tabs } = await seeded(['https://a.com/']);
    await updateSettings(store, { removeOnRestore: false });
    const g = (await store.read()).groups[0]!;
    await restoreGroup(store, tabs, g);
    expect(tabs.opened).toHaveLength(1);
    expect(urlsOf((await store.read()).groups[0])).toEqual(['https://a.com/']);
  });
});

describe('edits', () => {
  it('rename, delete tab, delete group', async () => {
    const { store } = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(W, [{ url: 'https://a.com/' }, { url: 'https://b.com/' }]);
    await saveWindow(store, tabs, { windowId: W, ownPagePrefix: OWN });
    let g = (await store.read()).groups[0]!;
    await renameGroup(store, g.id, '  Work\n  ');
    g = (await store.read()).groups[0]!;
    expect(g.name).toBe('Work');
    await deleteTab(store, g.tabs[0]!.id);
    expect(urlsOf((await store.read()).groups[0])).toEqual(['https://b.com/']);
    await deleteGroup(store, g.id);
    expect((await store.read()).groups).toEqual([]);
  });

  it('refuses to read data written by a newer schema version', async () => {
    const { store, backend } = newStore();
    await backend.set(STORAGE_KEY, { schemaVersion: 99, revision: 1, groups: [], settings: {} });
    await expect(store.read()).rejects.toThrow(/Unsupported schema/);
    await expect(updateSettings(store, { theme: 'dark' })).rejects.toThrow();
    expect((await backend.get(STORAGE_KEY) as { schemaVersion: number }).schemaVersion).toBe(99);
  });
});
