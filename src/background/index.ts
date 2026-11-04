/**
 * TabGattai service worker.
 *
 * Stateless by design: every event reads what it needs from chrome.storage.local, so the
 * worker can be stopped and restarted by Chrome at any time. Listeners are registered
 * synchronously at top level as required by Manifest V3.
 */
import { chromeTabsApi } from '../core/chromeTabs';
import { saveWindow } from '../core/services';
import { Store, chromeStorageBackend } from '../core/storage';

const MANAGER_PATH = 'manager.html';
const managerUrl = () => chrome.runtime.getURL(MANAGER_PATH);

type Notice = 'saved' | 'empty' | 'error';

/** Focuses the manager page in `windowId` (creating it if needed) and passes a notice. */
async function showManager(windowId: number | undefined, notice?: Notice, count?: number): Promise<void> {
  const params = new URLSearchParams();
  if (notice) params.set('notice', notice);
  if (count !== undefined) params.set('count', String(count));
  const url = managerUrl() + (params.size ? `?${params}` : '');

  // Match patterns cannot target chrome-extension:// URLs reliably, so filter manually.
  const candidates = await chrome.tabs.query(windowId !== undefined ? { windowId } : { windowType: 'normal' });
  const tab = candidates.find((t) => (t.url || t.pendingUrl || '').startsWith(managerUrl()));
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true, url });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true, windowId, index: 0 });
  }
}

async function onActionClicked(tab: chrome.tabs.Tab): Promise<void> {
  const windowId = tab.windowId;
  if (tab.incognito) {
    // Incognito is not supported in v1. Just show the manager in a normal window.
    await showManager(undefined);
    return;
  }
  const store = new Store(chromeStorageBackend());
  try {
    let shown = false;
    const result = await saveWindow(store, chromeTabsApi, {
      windowId,
      ownPagePrefix: managerUrl(),
      beforeClose: async (group) => {
        await showManager(windowId, 'saved', group.tabs.length);
        shown = true;
      },
    });
    if (result.status === 'empty') {
      await showManager(windowId, 'empty');
    } else if (!shown) {
      await showManager(windowId, 'saved', result.group.tabs.length);
    }
    await chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    console.error('[TabGattai] save failed', e);
    await chrome.action.setBadgeBackgroundColor({ color: '#c62828' }).catch(() => undefined);
    await chrome.action.setBadgeText({ text: '!' }).catch(() => undefined);
    await showManager(windowId, 'error').catch(() => undefined);
  }
}

chrome.action.onClicked.addListener((tab) => {
  void onActionClicked(tab);
});

// Test hook for end-to-end tests only (`vite build --mode e2e`); removed from production builds.
if (import.meta.env.MODE === 'e2e') {
  (globalThis as Record<string, unknown>).__tabgattaiE2E = { onActionClicked };
}
