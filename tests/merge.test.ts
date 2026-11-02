import { consolidateGroups, dedupeWithinTabs, mergeNewGroup, removeTabs } from '../src/core/merge';
import { group, tab, urlsOf } from './helpers';

const A = 'https://example.com/a';
const B = 'https://example.com/b';
const C = 'https://example.com/c';
const D = 'https://example.com/d';

describe('mergeNewGroup (latest wins)', () => {
  it('no duplicates: existing groups are untouched (same objects)', () => {
    const g1 = group('g1', 1, [A, B]);
    const r = mergeNewGroup([g1], group('new', 2, [C, D]));
    expect(r.groups.map((g) => g.id)).toEqual(['new', 'g1']);
    expect(r.groups[1]).toBe(g1);
    expect(r.movedCount).toBe(0);
  });

  it('spec example: b moves from group A to group B', () => {
    const gA = group('A', 1, [A, B, C], 'Nov 1');
    const r = mergeNewGroup([gA], group('B', 2, [B, D]));
    expect(urlsOf(r.groups[0])).toEqual([B, D]);
    expect(urlsOf(r.groups[1])).toEqual([A, C]);
    expect(r.groups[1]!.name).toBe('Nov 1'); // name never changed by moves
    expect(r.groups[1]!.id).toBe('A');
    expect(r.movedCount).toBe(1);
  });

  it('duplicates inside the same new group are stored once (last processed wins)', () => {
    const first = tab(A, 'first');
    const last = tab(A, 'last');
    const r = mergeNewGroup([], { id: 'n', name: '', createdAt: 1, tabs: [first, tab(B), last] });
    expect(urlsOf(r.groups[0])).toEqual([B, A]);
    expect(r.groups[0]!.tabs[1]!.title).toBe('last');
  });

  it('removes the URL from 3+ older groups', () => {
    const groups = [group('g3', 3, [A, B]), group('g2', 2, [A, C]), group('g1', 1, [A, D])];
    const r = mergeNewGroup(groups, group('n', 4, [A]));
    expect(r.groups.map(urlsOf)).toEqual([[A], [B], [C], [D]]);
    expect(r.movedCount).toBe(3);
  });

  it('deletes older groups that become empty', () => {
    const r = mergeNewGroup([group('g2', 2, [C]), group('g1', 1, [A, B])], group('n', 3, [A, B]));
    expect(r.groups.map((g) => g.id)).toEqual(['n', 'g2']);
    expect(r.removedGroupIds).toEqual(['g1']);
  });

  it('different query parameters are different URLs', () => {
    const r = mergeNewGroup([group('g1', 1, ['https://e.com/?q=1'])], group('n', 2, ['https://e.com/?q=2']));
    expect(r.groups.map(urlsOf)).toEqual([['https://e.com/?q=2'], ['https://e.com/?q=1']]);
  });

  it('different fragments are different URLs', () => {
    const r = mergeNewGroup([group('g1', 1, ['https://e.com/p#x'])], group('n', 2, ['https://e.com/p#y']));
    expect(r.groups).toHaveLength(2);
  });

  it('trailing slash and case are not normalized', () => {
    const r = mergeNewGroup([group('g1', 1, ['https://e.com/p', 'https://e.com/Q'])], group('n', 2, ['https://e.com/p/', 'https://e.com/q']));
    expect(r.groups).toHaveLength(2);
    expect(urlsOf(r.groups[1])).toEqual(['https://e.com/p', 'https://e.com/Q']);
  });

  it('same URL with a different title: the new title wins', () => {
    const old = { id: 'g1', name: '', createdAt: 1, tabs: [tab(A, 'Old title')] };
    const r = mergeNewGroup([old], { id: 'n', name: '', createdAt: 2, tabs: [tab(A, 'New title')] });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.tabs[0]!.title).toBe('New title');
  });

  it('an empty new group is not added', () => {
    const g1 = group('g1', 1, [A]);
    expect(mergeNewGroup([g1], { id: 'n', name: '', createdAt: 2, tabs: [] }).groups).toEqual([g1]);
  });

  it('new group wins even if its timestamp is older (clock skew)', () => {
    const r = mergeNewGroup([group('g1', 100, [A, B])], group('n', 1, [A]));
    expect(r.groups[0]!.id).toBe('n');
    expect(urlsOf(r.groups[1])).toEqual([B]);
  });

  it('supports an injected duplicate-key function (future normalization)', () => {
    const lower = (u: string) => u.toLowerCase();
    const r = mergeNewGroup([group('g1', 1, ['https://E.com/'])], group('n', 2, ['https://e.com/']), lower);
    expect(r.groups).toHaveLength(1);
  });
});

describe('dedupeWithinTabs', () => {
  it('keeps the last occurrence at its position', () => {
    const tabs = [tab(A, '1'), tab(B), tab(A, '2'), tab(C), tab(B, 'b2')];
    expect(dedupeWithinTabs(tabs).map((t) => t.title)).toEqual(['2', C, 'b2']);
  });
});

describe('consolidateGroups', () => {
  it('keeps each URL in the newest group by createdAt', () => {
    const r = consolidateGroups([group('old', 1, [A, B]), group('new', 5, [A]), group('mid', 3, [B, C])]);
    expect(r.map((g) => g.id)).toEqual(['new', 'mid']); // 'old' became empty -> dropped
    expect(r.map(urlsOf)).toEqual([[A], [B, C]]);
  });
  it('on equal createdAt the earlier group in input wins', () => {
    const r = consolidateGroups([group('existing', 1, [A]), group('imported', 1, [A])]);
    expect(r.map((g) => g.id)).toEqual(['existing']);
  });
});

describe('removeTabs', () => {
  it('removes tabs and deletes empty groups', () => {
    const g1 = group('g1', 1, [A]);
    const g2 = group('g2', 2, [B, C]);
    const r = removeTabs([g2, g1], new Set([g1.tabs[0]!.id, g2.tabs[0]!.id]));
    expect(r.map(urlsOf)).toEqual([[C]]);
  });
});
