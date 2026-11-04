/**
 * Application use-cases (save, restore, edit, import). Chrome tab APIs are injected through
 * `TabsApi` so the logic can be unit-tested without a browser.
 */
import { newId } from './id';
import { collectIds, mergeImported, parseImport, type ImportStats } from './importExport';
import { withLock } from './lock';
import { countTabs, dedupeWithinTabs, mergeNewGroup, removeTabs } from './merge';
import { sanitizeSettings } from './settings';
import type { Store } from './storage';
import type { SavedTab, Settings, StoreData, TabGroup } from './types';
import { isSafeToOpen, isSavableUrl } from './url';

/** The subset of a chrome.tabs.Tab TabGattai needs. */
export interface BrowserTab {
  id?: number;
  index: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  pinned: boolean;
  incognito: boolean;
}

export interface TabsApi {
  queryWindow(windowId: number): Promise<BrowserTab[]>;
  /** Closes tabs. Must not throw for tabs that are already gone. */
  close(tabIds: number[]): Promise<void>;
  open(url: string, options: { active: boolean; windowId?: number }): Promise<void>;
}

// ---------------------------------------------------------------- save

export interface SaveOptions {
  windowId: number;
  /** URL prefix of TabGattai's own pages; such tabs are never saved nor closed. */
  ownPagePrefix: string;
  now?: number;
  /**
   * Called after the data has been persisted and verified, BEFORE tabs are closed.
   * The background uses it to open the manager page so the window never ends up empty.
   */
  beforeClose?: (group: TabGroup) => Promise<void>;
}

export type SaveResult =
  | { status: 'saved'; group: TabGroup; closedCount: number; movedCount: number }
  | { status: 'empty' };

/** Returns the URL TabGattai would save for a tab, or null if the tab is not a save target. */
export function saveTargetUrl(tab: BrowserTab, settings: Settings, ownPagePrefix: string): string | null {
  if (tab.incognito) return null; // Incognito is not supported in v1.
  if (tab.pinned && !settings.includePinned) return null;
  const url = tab.url || tab.pendingUrl || '';
  if (ownPagePrefix && url.startsWith(ownPagePrefix)) return null;
  return isSavableUrl(url) ? url : null;
}

const SAVE_LOCK = 'tabgattai-save';

/**
 * Saves the tabs of a window as a new group and closes them.
 *
 * Order of operations (data safety):
 *  1. collect targets
 *  2. merge + write + verify (Store.update) — throws on failure, nothing is closed
 *  3. beforeClose() (open manager page)
 *  4. close only the tabs that were saved
 *
 * The whole operation is serialized, so two concurrent saves never save/close the same tabs twice.
 */
export function saveWindow(store: Store, tabsApi: TabsApi, opts: SaveOptions): Promise<SaveResult> {
  return withLock(SAVE_LOCK, async () => {
    const now = opts.now ?? Date.now();
    const { settings } = await store.read();
    const browserTabs = await tabsApi.queryWindow(opts.windowId);

    // Processing order = ascending tab-strip index. With dedupeWithinTabs ("last processed
    // wins"), the right-most of several identical tabs provides the title.
    const ordered = [...browserTabs].sort((a, b) => a.index - b.index);
    const candidates: SavedTab[] = [];
    const toClose: number[] = [];
    for (const t of ordered) {
      const url = saveTargetUrl(t, settings, opts.ownPagePrefix);
      if (url === null) continue;
      candidates.push({ id: newId(), url, title: (t.title ?? '').trim() || url, savedAt: now });
      if (typeof t.id === 'number') toClose.push(t.id);
    }
    const tabs = dedupeWithinTabs(candidates);
    if (tabs.length === 0) return { status: 'empty' };

    const group: TabGroup = { id: newId(), name: '', createdAt: now, tabs };
    let movedCount = 0;
    const written = await store.update((cur) => {
      const r = mergeNewGroup(cur.groups, group);
      movedCount = r.movedCount;
      return { ...cur, groups: r.groups };
    });
    if (!written.groups.some((g) => g.id === group.id)) {
      throw new Error('Saved group missing after write');
    }

    if (opts.beforeClose) await opts.beforeClose({ ...group });
    await tabsApi.close(toClose);
    return { status: 'saved', group, closedCount: toClose.length, movedCount };
  });
}

// ---------------------------------------------------------------- restore

export interface RestoreResult {
  opened: string[];
  failed: string[];
}

/**
 * Opens the given saved tabs. Successfully opened tabs are removed from the data when
 * `settings.removeOnRestore` is on; tabs that failed to open always stay.
 */
export async function restoreTabs(
  store: Store,
  tabsApi: TabsApi,
  tabIds: readonly string[],
  options: { windowId?: number; activateFirst?: boolean } = {},
): Promise<RestoreResult> {
  const data = await store.read();
  const byId = new Map<string, SavedTab>();
  for (const g of data.groups) for (const t of g.tabs) byId.set(t.id, t);

  const opened: string[] = [];
  const failed: string[] = [];
  let first = true;
  for (const id of tabIds) {
    const tab = byId.get(id);
    if (!tab) continue; // already gone (e.g. removed in another window)
    if (!isSafeToOpen(tab.url)) {
      failed.push(id);
      continue;
    }
    try {
      await tabsApi.open(tab.url, { active: Boolean(options.activateFirst) && first, windowId: options.windowId });
      opened.push(id);
      first = false;
    } catch {
      failed.push(id);
    }
  }
  if (opened.length > 0 && data.settings.removeOnRestore) {
    const ids = new Set(opened);
    // Re-read inside the lock: another context may have changed the data meanwhile.
    await store.update((cur) => (cur.settings.removeOnRestore ? { ...cur, groups: removeTabs(cur.groups, ids) } : null));
  }
  return { opened, failed };
}

export function restoreGroup(store: Store, tabsApi: TabsApi, group: TabGroup, windowId?: number): Promise<RestoreResult> {
  return restoreTabs(
    store,
    tabsApi,
    group.tabs.map((t) => t.id),
    { windowId, activateFirst: false },
  );
}

// ---------------------------------------------------------------- edit

export function deleteGroup(store: Store, groupId: string): Promise<StoreData> {
  return store.update((cur) => ({ ...cur, groups: cur.groups.filter((g) => g.id !== groupId) }));
}

export function deleteTab(store: Store, tabId: string): Promise<StoreData> {
  return store.update((cur) => ({ ...cur, groups: removeTabs(cur.groups, new Set([tabId])) }));
}

export const MAX_GROUP_NAME = 200;

export function renameGroup(store: Store, groupId: string, name: string): Promise<StoreData> {
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_GROUP_NAME);
  return store.update((cur) => ({
    ...cur,
    groups: cur.groups.map((g) => (g.id === groupId ? { ...g, name: clean } : g)),
  }));
}

export function updateSettings(store: Store, patch: Partial<Settings>): Promise<StoreData> {
  return store.update((cur) => ({ ...cur, settings: sanitizeSettings({ ...cur.settings, ...patch }) }));
}

export interface ImportResult {
  stats: ImportStats;
  totalBefore: number;
  totalAfter: number;
}

/** Validates `text` and merges it into the stored data (with latest-wins de-duplication). */
export async function importJson(store: Store, text: string, now: number = Date.now()): Promise<ImportResult> {
  let stats: ImportStats | undefined;
  let totalBefore = 0;
  const written = await store.update((cur) => {
    totalBefore = countTabs(cur.groups);
    const parsed = parseImport(text, collectIds(cur.groups), now);
    stats = parsed.stats;
    if (parsed.groups.length === 0) return null;
    return { ...cur, groups: mergeImported(cur.groups, parsed.groups) };
  });
  return { stats: stats!, totalBefore, totalAfter: countTabs(written.groups) };
}
