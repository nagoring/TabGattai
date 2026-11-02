/**
 * Persistence layer.
 *
 * The whole state is stored under ONE key in chrome.storage.local, so each write is atomic:
 * a reader sees either the previous or the next state, never a half-written one.
 * All read-modify-write cycles go through `update()`, which holds a cross-context lock and
 * verifies the write by reading it back.
 */
import { withLock } from './lock';
import { sanitizeSettings } from './settings';
import { SCHEMA_VERSION, createEmptyStore, type StoreData, type TabGroup } from './types';

export const STORAGE_KEY = 'tabmerge';
const LOCK_NAME = 'tabmerge-store';

/** Minimal key/value interface over chrome.storage.local (injectable for tests). */
export interface StorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: 'write-failed' | 'verify-failed' | 'unsupported-schema' | 'read-failed',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function chromeStorageBackend(area: chrome.storage.StorageArea = chrome.storage.local): StorageBackend {
  return {
    async get(key) {
      const res = await area.get(key);
      return res[key];
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
  };
}

/**
 * Converts raw persisted data into the current schema.
 * Data written by a NEWER version is refused (never silently downgraded / overwritten).
 */
export function migrate(raw: unknown): StoreData {
  if (raw === undefined || raw === null) return createEmptyStore();
  if (typeof raw !== 'object') throw new StorageError('Stored data is corrupted', 'read-failed');
  const r = raw as Partial<StoreData>;
  const version = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new StorageError(`Unsupported schema version ${version}`, 'unsupported-schema');
  }
  // version 0/1 share the same shape. Future migrations go here (version-by-version).
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: typeof r.revision === 'number' && Number.isFinite(r.revision) ? r.revision : 0,
    groups: Array.isArray(r.groups) ? (r.groups as TabGroup[]) : [],
    settings: sanitizeSettings(r.settings),
  };
}

export class Store {
  constructor(private readonly backend: StorageBackend) {}

  async read(): Promise<StoreData> {
    return migrate(await this.backend.get(STORAGE_KEY));
  }

  /**
   * Atomically applies `mutate` to the current state.
   * `mutate` may return `null` to skip writing. Resolves only after the new state has been
   * written AND read back successfully; rejects otherwise (callers must then not perform
   * irreversible actions such as closing tabs).
   */
  update(mutate: (current: StoreData) => StoreData | null): Promise<StoreData> {
    return withLock(LOCK_NAME, async () => {
      const current = await this.read();
      const next = mutate(current);
      if (next === null) return current;
      const toWrite: StoreData = { ...next, schemaVersion: SCHEMA_VERSION, revision: current.revision + 1 };
      try {
        await this.backend.set(STORAGE_KEY, toWrite);
      } catch (e) {
        throw new StorageError(`Failed to write data: ${String(e)}`, 'write-failed');
      }
      let check: StoreData;
      try {
        check = await this.read();
      } catch (e) {
        throw new StorageError(`Failed to verify written data: ${String(e)}`, 'verify-failed');
      }
      if (check.revision !== toWrite.revision || check.groups.length !== toWrite.groups.length) {
        throw new StorageError('Written data could not be verified', 'verify-failed');
      }
      return toWrite;
    });
  }
}
