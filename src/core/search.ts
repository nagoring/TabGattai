import type { TabGroup } from './types';

/**
 * Filters groups by a free-text query across ALL groups.
 * Case-insensitive partial match against title and URL. Groups without matches are omitted.
 * An empty / whitespace query returns the input unchanged.
 */
export function filterGroups(groups: readonly TabGroup[], query: string): readonly TabGroup[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return groups;
  const out: TabGroup[] = [];
  for (const g of groups) {
    const tabs = g.tabs.filter((t) => t.title.toLocaleLowerCase().includes(q) || t.url.toLocaleLowerCase().includes(q));
    if (tabs.length > 0) out.push(tabs.length === g.tabs.length ? g : { ...g, tabs });
  }
  return out;
}
