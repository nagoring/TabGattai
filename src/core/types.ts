/** Current schema version of the persisted data (chrome.storage.local). */
export const SCHEMA_VERSION = 1;

/** A saved tab. `id` is a TabMerge-owned persistent ID (never Chrome's tabId). */
export interface SavedTab {
  id: string;
  url: string;
  title: string;
  /** Unix timestamp in milliseconds. */
  savedAt: number;
}

/** A group of tabs saved at the same time. */
export interface TabGroup {
  id: string;
  /** User-defined name. Empty string means "no name" (the date is shown instead). */
  name: string;
  /** Unix timestamp in milliseconds. */
  createdAt: number;
  tabs: SavedTab[];
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type LanguageSetting = 'ja' | 'en';

export interface Settings {
  /** Include pinned tabs when saving. Default: false. */
  includePinned: boolean;
  /** Remove a tab from the saved data after it has been restored. Default: true. */
  removeOnRestore: boolean;
  theme: ThemeSetting;
  language: LanguageSetting;
}

/** The whole persisted state, stored under a single key so that every write is atomic. */
export interface StoreData {
  schemaVersion: number;
  /** Incremented on every successful write. Used to verify writes. */
  revision: number;
  /** Ordered newest first. */
  groups: TabGroup[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  includePinned: false,
  removeOnRestore: true,
  theme: 'system',
  language: 'ja',
});

export function createEmptyStore(): StoreData {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    groups: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
