/**
 * Duplicate URL merging ("latest wins").
 *
 * Invariant of the store: a URL (by duplicateKey) exists at most once across all groups,
 * and no group is empty.
 *
 * This module is pure (no Chrome APIs, no UI) so the rules can be tested and changed in isolation.
 */
import type { SavedTab, TabGroup } from './types';
import { duplicateKey as defaultKey, type DuplicateKeyFn } from './url';

/**
 * De-duplicates a list of tabs that are being saved in ONE save operation.
 *
 * Rule (explicit, see spec 4.3): the tab that is PROCESSED LAST wins.
 * "Processed" means the position in the `tabs` array passed to this function — it is NOT
 * the tab strip position or the last-access time. The caller decides the processing order
 * (the background script processes tabs in ascending tab-strip index, so the right-most
 * duplicate wins). The winner keeps the position of its LAST occurrence.
 */
export function dedupeWithinTabs(tabs: readonly SavedTab[], keyOf: DuplicateKeyFn = defaultKey): SavedTab[] {
  const lastIndex = new Map<string, number>();
  tabs.forEach((t, i) => lastIndex.set(keyOf(t.url), i));
  return tabs.filter((t, i) => lastIndex.get(keyOf(t.url)) === i);
}

export interface MergeResult {
  groups: TabGroup[];
  /** Number of tabs removed from older groups because they moved to the new group. */
  movedCount: number;
  /** IDs of older groups deleted because they became empty. */
  removedGroupIds: string[];
}

/**
 * Adds `newGroup` as the newest group and removes its URLs from all older groups.
 *
 * - `newGroup` always wins, regardless of timestamps (it is the save being performed now).
 * - Older groups that lose tabs keep their id, name and createdAt (name is never changed).
 * - Older groups that become empty are deleted.
 * - Older groups without duplicates are returned as the SAME object (unchanged).
 * - If `newGroup` itself is empty after de-duplication, nothing is added.
 */
export function mergeNewGroup(
  existing: readonly TabGroup[],
  newGroup: TabGroup,
  keyOf: DuplicateKeyFn = defaultKey,
): MergeResult {
  const tabs = dedupeWithinTabs(newGroup.tabs, keyOf);
  if (tabs.length === 0) {
    return { groups: [...existing], movedCount: 0, removedGroupIds: [] };
  }
  const incoming = new Set(tabs.map((t) => keyOf(t.url)));
  let movedCount = 0;
  const removedGroupIds: string[] = [];
  const kept: TabGroup[] = [];
  for (const g of existing) {
    const remaining = g.tabs.filter((t) => !incoming.has(keyOf(t.url)));
    if (remaining.length === g.tabs.length) {
      kept.push(g);
      continue;
    }
    movedCount += g.tabs.length - remaining.length;
    if (remaining.length === 0) {
      removedGroupIds.push(g.id);
    } else {
      kept.push({ ...g, tabs: remaining });
    }
  }
  return { groups: [{ ...newGroup, tabs }, ...kept], movedCount, removedGroupIds };
}

/**
 * Re-establishes the store invariant over an arbitrary list of groups (used by import).
 *
 * - Groups are ordered newest first by `createdAt`. On equal `createdAt` the group that
 *   appears EARLIER in `groups` is treated as newer (callers put existing data first so that
 *   re-importing the same file is a no-op).
 * - Each URL is kept only in the newest group containing it.
 * - Inside a single group, the last occurrence wins (same rule as dedupeWithinTabs).
 * - Empty groups are dropped. Groups that did not change are returned as the same object.
 */
export function consolidateGroups(groups: readonly TabGroup[], keyOf: DuplicateKeyFn = defaultKey): TabGroup[] {
  const ordered = groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => b.g.createdAt - a.g.createdAt || a.i - b.i)
    .map((x) => x.g);
  const seen = new Set<string>();
  const result: TabGroup[] = [];
  for (const g of ordered) {
    const unique = dedupeWithinTabs(g.tabs, keyOf).filter((t) => !seen.has(keyOf(t.url)));
    for (const t of unique) seen.add(keyOf(t.url));
    if (unique.length === 0) continue;
    result.push(unique.length === g.tabs.length ? g : { ...g, tabs: unique });
  }
  return result;
}

/** Total number of saved tabs. */
export function countTabs(groups: readonly TabGroup[]): number {
  return groups.reduce((n, g) => n + g.tabs.length, 0);
}

/** Removes the given tab IDs; groups that become empty are deleted. */
export function removeTabs(groups: readonly TabGroup[], tabIds: ReadonlySet<string>): TabGroup[] {
  const out: TabGroup[] = [];
  for (const g of groups) {
    const remaining = g.tabs.filter((t) => !tabIds.has(t.id));
    if (remaining.length === g.tabs.length) out.push(g);
    else if (remaining.length > 0) out.push({ ...g, tabs: remaining });
  }
  return out;
}
