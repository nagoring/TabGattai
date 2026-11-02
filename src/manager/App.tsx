import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { chromeTabsApi } from '../core/chromeTabs';
import { buildExport, exportFileName, ImportError } from '../core/importExport';
import { countTabs } from '../core/merge';
import { filterGroups } from '../core/search';
import {
  deleteGroup,
  deleteTab,
  importJson,
  renameGroup,
  restoreGroup,
  restoreTabs,
  updateSettings,
} from '../core/services';
import { STORAGE_KEY, Store, chromeStorageBackend, migrate } from '../core/storage';
import type { SavedTab, Settings, StoreData, TabGroup } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { I18nContext, makeTranslator, type I18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';
import { GroupList } from './components/GroupList';
import { Logo } from './components/Logo';
import { SettingsPanel } from './components/SettingsPanel';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

const store = new Store(chromeStorageBackend());
let toastSeq = 0;

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function App() {
  const [data, setData] = useState<StoreData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const settings = data?.settings ?? DEFAULT_SETTINGS;
  const i18n: I18n = useMemo(() => ({ t: makeTranslator(settings.language), lang: settings.language }), [settings.language]);
  const { t } = i18n;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastSeq;
    setToasts((ts) => [...ts.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  // Load + live updates (other manager tabs, background saves).
  useEffect(() => {
    let alive = true;
    store
      .read()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setLoadError(String(e instanceof Error ? e.message : e)));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !(STORAGE_KEY in changes)) return;
      try {
        setData(migrate(changes[STORAGE_KEY]!.newValue));
      } catch (e) {
        setLoadError(String(e instanceof Error ? e.message : e));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  // Notice passed by the background after clicking the toolbar icon.
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(location.search);
    const notice = params.get('notice');
    if (!notice) return;
    const count = Number(params.get('count') ?? 0);
    if (notice === 'saved') toast(t('noticeSaved', { count }));
    else if (notice === 'empty') toast(t('noticeEmpty'));
    else if (notice === 'error') toast(t('noticeError'), 'error');
    history.replaceState(null, '', location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        toast(t('opFailed', { message: e instanceof Error ? e.message : String(e) }), 'error');
        return undefined;
      }
    },
    [t, toast],
  );

  const groups = data?.groups ?? [];
  const total = useMemo(() => countTabs(groups), [groups]);
  const totals = useMemo(() => new Map(groups.map((g) => [g.id, g.tabs.length])), [groups]);
  const visible = useMemo(() => filterGroups(groups, deferredQuery), [groups, deferredQuery]);
  const searching = deferredQuery.trim().length > 0;
  const matchCount = useMemo(() => (searching ? countTabs(visible) : 0), [visible, searching]);

  const onOpenTab = useCallback(
    (tab: SavedTab, background: boolean) =>
      void run(async () => {
        const r = await restoreTabs(store, chromeTabsApi, [tab.id], { activateFirst: !background });
        if (r.failed.length) toast(t('restorePartial', { failed: r.failed.length }), 'error');
      }),
    [run, t, toast],
  );
  const onRemoveTab = useCallback((tab: SavedTab) => void run(() => deleteTab(store, tab.id)), [run]);
  const findFull = useCallback((g: TabGroup) => groups.find((x) => x.id === g.id) ?? g, [groups]);
  const onRestoreGroup = useCallback(
    (g: TabGroup) =>
      void run(async () => {
        const r = await restoreGroup(store, chromeTabsApi, findFull(g));
        if (r.failed.length) toast(t('restorePartial', { failed: r.failed.length }), 'error');
        else toast(t('restoreDone', { count: r.opened.length }));
      }),
    [run, t, toast, findFull],
  );
  const onDeleteGroup = useCallback(
    (g: TabGroup) => {
      const full = findFull(g);
      if (!confirm(t('confirmDeleteGroup', { count: full.tabs.length }))) return;
      void run(() => deleteGroup(store, g.id));
    },
    [run, t, findFull],
  );
  const onRenameGroup = useCallback((g: TabGroup, name: string) => void run(() => renameGroup(store, g.id, name)), [run]);
  const onCopyGroup = useCallback(
    (g: TabGroup) => {
      const urls = findFull(g).tabs.map((x) => x.url);
      navigator.clipboard.writeText(urls.join('\n')).then(
        () => toast(t('copied', { count: urls.length })),
        () => toast(t('copyFailed'), 'error'),
      );
    },
    [t, toast, findFull],
  );
  const onToggleCollapsed = useCallback((id: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const onExport = useCallback(() => {
    if (data) downloadJson(exportFileName(), buildExport(data));
  }, [data]);

  const onImport = useCallback(
    async (file: File, backupFirst: boolean) => {
      try {
        const text = await file.text();
        if (backupFirst) {
          const current = await store.read();
          downloadJson(exportFileName().replace('tabmerge-', 'tabmerge-backup-'), buildExport(current));
        }
        const r = await importJson(store, text);
        toast(t('importDone', { groups: r.stats.groups, tabs: r.stats.tabs, before: r.totalBefore, after: r.totalAfter }));
        if (r.stats.invalidUrls || r.stats.invalidEntries) {
          toast(t('importSkipped', { invalidUrls: r.stats.invalidUrls, invalidEntries: r.stats.invalidEntries }));
        }
      } catch (e) {
        const reasons: Record<string, MessageKey> = {
          'invalid-json': 'importErrInvalidJson',
          'invalid-format': 'importErrInvalidFormat',
          'unsupported-version': 'importErrUnsupported',
          'too-large': 'importErrTooLarge',
          'too-many': 'importErrTooMany',
        };
        const reason = e instanceof ImportError ? t(reasons[e.code]!) : e instanceof Error ? e.message : String(e);
        toast(t('importError', { reason }), 'error');
      }
    },
    [t, toast],
  );

  const onSettingsChange = useCallback((patch: Partial<Settings>) => void run(() => updateSettings(store, patch)), [run]);

  useEffect(() => {
    document.title = `${t('appName')} (${total})`;
  }, [t, total]);

  return (
    <I18nContext.Provider value={i18n}>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <h1>{t('appName')}</h1>
          <span className="total" aria-live="polite">
            {t('totalTabs', { count: total })} · {t('totalGroups', { count: groups.length })}
          </span>
        </div>
        <div className="search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
          />
          {searching && <span className="search-count">{t('searchResult', { count: matchCount })}</span>}
        </div>
        <button type="button" className="button" onClick={() => setSettingsOpen(true)}>
          ⚙ {t('settings')}
        </button>
      </header>

      <main>
        {loadError ? (
          <p className="error">{t('storageError', { message: loadError })}</p>
        ) : data ? (
          <GroupList
            groups={visible}
            totals={totals}
            collapsed={collapsed}
            searching={searching}
            onToggleCollapsed={onToggleCollapsed}
            onOpenTab={onOpenTab}
            onRemoveTab={onRemoveTab}
            onRestoreGroup={onRestoreGroup}
            onDeleteGroup={onDeleteGroup}
            onRenameGroup={onRenameGroup}
            onCopyGroup={onCopyGroup}
          />
        ) : null}
      </main>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={onSettingsChange}
          onExport={onExport}
          onImport={onImport}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`}>
            {x.text}
          </div>
        ))}
      </div>
    </I18nContext.Provider>
  );
}
