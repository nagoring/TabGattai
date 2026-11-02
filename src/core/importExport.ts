/**
 * JSON export / import.
 *
 * Export format (version 1):
 * {
 *   "format": "tabmerge-export",
 *   "formatVersion": 1,
 *   "exportedAt": "2026-11-02T10:00:00.000Z",
 *   "groups": [
 *     { "id": "...", "name": "", "createdAt": "ISO-8601",
 *       "tabs": [ { "id": "...", "url": "https://...", "title": "...", "savedAt": "ISO-8601" } ] }
 *   ]
 * }
 * Favicons are not exported; they are derived from the URL when displayed.
 */
import { newId, isValidId } from './id';
import { consolidateGroups } from './merge';
import type { SavedTab, StoreData, TabGroup } from './types';
import { isSavableUrl } from './url';

export const EXPORT_FORMAT = 'tabmerge-export';
export const EXPORT_FORMAT_VERSION = 1;

export const IMPORT_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  maxGroups: 10_000,
  maxTabs: 200_000,
  maxTitleLength: 1_000,
  maxNameLength: 200,
});

export interface ExportedTab {
  id: string;
  url: string;
  title: string;
  savedAt: string;
}
export interface ExportedGroup {
  id: string;
  name: string;
  createdAt: string;
  tabs: ExportedTab[];
}
export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  groups: ExportedGroup[];
}

const iso = (ms: number) => new Date(ms).toISOString();

export function buildExport(data: Pick<StoreData, 'groups'>, now: number = Date.now()): ExportFile {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: iso(now),
    groups: data.groups.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: iso(g.createdAt),
      tabs: g.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, savedAt: iso(t.savedAt) })),
    })),
  };
}

export function exportFileName(now: number = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `tabmerge-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

export type ImportErrorCode = 'too-large' | 'invalid-json' | 'invalid-format' | 'unsupported-version' | 'too-many';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ImportStats {
  groups: number;
  tabs: number;
  /** Tabs dropped because the URL was invalid or used a disallowed scheme. */
  invalidUrls: number;
  /** Entries dropped because they were not objects / had the wrong shape. */
  invalidEntries: number;
  /** IDs that were missing, malformed or colliding and were regenerated. */
  regeneratedIds: number;
  /** Timestamps that were missing, invalid or in the future and were clamped to the import time. */
  fixedTimestamps: number;
}

export interface ParsedImport {
  groups: TabGroup[];
  stats: ImportStats;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strips control characters and limits length. */
function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/**
 * Parses and strictly validates an export file.
 * - Unknown format / version -> ImportError (nothing is imported).
 * - Bad tabs/groups are skipped and counted, valid ones are kept.
 * - IDs are regenerated when invalid or duplicated (within the file or against `existingIds`).
 * - Timestamps in the future or invalid are clamped to `now`.
 */
export function parseImport(text: string, existingIds: ReadonlySet<string> = new Set(), now: number = Date.now()): ParsedImport {
  if (text.length > IMPORT_LIMITS.maxBytes) throw new ImportError('too-large', 'File is too large');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('invalid-json', 'Not valid JSON');
  }
  if (!isRecord(json) || json.format !== EXPORT_FORMAT || !Array.isArray(json.groups)) {
    throw new ImportError('invalid-format', 'Not a TabMerge export file');
  }
  if (typeof json.formatVersion !== 'number' || !Number.isInteger(json.formatVersion) || json.formatVersion < 1) {
    throw new ImportError('invalid-format', 'Missing format version');
  }
  if (json.formatVersion > EXPORT_FORMAT_VERSION) {
    throw new ImportError('unsupported-version', `Unsupported format version ${json.formatVersion}`);
  }
  if (json.groups.length > IMPORT_LIMITS.maxGroups) throw new ImportError('too-many', 'Too many groups');

  const stats: ImportStats = { groups: 0, tabs: 0, invalidUrls: 0, invalidEntries: 0, regeneratedIds: 0, fixedTimestamps: 0 };
  const usedIds = new Set(existingIds);
  const takeId = (v: unknown): string => {
    if (isValidId(v) && !usedIds.has(v)) {
      usedIds.add(v);
      return v;
    }
    stats.regeneratedIds++;
    let id = newId();
    while (usedIds.has(id)) id = newId();
    usedIds.add(id);
    return id;
  };
  const takeTime = (v: unknown, fallback: number): number => {
    let ms = NaN;
    if (typeof v === 'number') ms = v;
    else if (typeof v === 'string' && v.length <= 64) ms = Date.parse(v);
    if (!Number.isFinite(ms) || ms < 0 || ms > now) {
      stats.fixedTimestamps++;
      return fallback;
    }
    return Math.floor(ms);
  };

  let totalTabs = 0;
  const groups: TabGroup[] = [];
  for (const rawGroup of json.groups) {
    if (!isRecord(rawGroup) || !Array.isArray(rawGroup.tabs)) {
      stats.invalidEntries++;
      continue;
    }
    totalTabs += rawGroup.tabs.length;
    if (totalTabs > IMPORT_LIMITS.maxTabs) throw new ImportError('too-many', 'Too many tabs');
    const createdAt = takeTime(rawGroup.createdAt, now);
    const tabs: SavedTab[] = [];
    for (const rawTab of rawGroup.tabs) {
      if (!isRecord(rawTab)) {
        stats.invalidEntries++;
        continue;
      }
      if (!isSavableUrl(rawTab.url)) {
        stats.invalidUrls++;
        continue;
      }
      const url = rawTab.url;
      tabs.push({
        id: takeId(rawTab.id),
        url,
        title: cleanText(rawTab.title, IMPORT_LIMITS.maxTitleLength) || url,
        savedAt: takeTime(rawTab.savedAt, createdAt),
      });
    }
    if (tabs.length === 0) continue;
    groups.push({ id: takeId(rawGroup.id), name: cleanText(rawGroup.name, IMPORT_LIMITS.maxNameLength), createdAt, tabs });
  }
  stats.groups = groups.length;
  stats.tabs = groups.reduce((n, g) => n + g.tabs.length, 0);
  return { groups, stats };
}

/**
 * Merges imported groups into existing data and re-applies "latest wins" de-duplication.
 * Existing groups come first, so on equal timestamps existing data wins and importing the
 * same file twice does not create duplicates.
 */
export function mergeImported(existing: readonly TabGroup[], imported: readonly TabGroup[]): TabGroup[] {
  return consolidateGroups([...existing, ...imported]);
}

/** All IDs (group + tab) currently in use. */
export function collectIds(groups: readonly TabGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) {
    ids.add(g.id);
    for (const t of g.tabs) ids.add(t.id);
  }
  return ids;
}
