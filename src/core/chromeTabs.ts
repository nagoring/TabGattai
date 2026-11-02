import type { TabsApi } from './services';

/** TabsApi implementation backed by chrome.tabs. */
export const chromeTabsApi: TabsApi = {
  async queryWindow(windowId) {
    const tabs = await chrome.tabs.query({ windowId });
    return tabs.map((t) => ({
      id: t.id,
      index: t.index,
      url: t.url,
      pendingUrl: t.pendingUrl,
      title: t.title,
      pinned: t.pinned,
      incognito: t.incognito,
    }));
  },
  async close(tabIds) {
    if (tabIds.length === 0) return;
    try {
      await chrome.tabs.remove(tabIds);
    } catch {
      // Some tabs may already be closed; fall back to closing one by one.
      await Promise.all(tabIds.map((id) => chrome.tabs.remove(id).catch(() => undefined)));
    }
  },
  async open(url, { active, windowId }) {
    await chrome.tabs.create({ url, active, windowId });
  },
};
