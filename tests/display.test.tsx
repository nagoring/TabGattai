import { renderToString } from 'react-dom/server';
import { filterGroups } from '../src/core/search';
import type { TabGroup } from '../src/core/types';
import { GroupList } from '../src/manager/components/GroupList';
import { I18nContext, makeTranslator } from '../src/i18n';
import { MESSAGES } from '../src/i18n/messages';
import { group } from './helpers';

function bigData(groupCount: number, perGroup: number): TabGroup[] {
  return Array.from({ length: groupCount }, (_, gi) =>
    group(`g${gi}`, groupCount - gi, Array.from({ length: perGroup }, (_, ti) => `https://site${gi}.example/page/${ti}`)),
  );
}
const noop = () => undefined;
function render(groups: readonly TabGroup[], searching = false) {
  return renderToString(
    <I18nContext.Provider value={{ t: makeTranslator('ja'), lang: 'ja' }}>
      <GroupList
        groups={groups}
        totals={new Map(groups.map((g) => [g.id, g.tabs.length]))}
        collapsed={new Set()}
        searching={searching}
        onToggleCollapsed={noop}
        onOpenTab={noop}
        onRemoveTab={noop}
        onRestoreGroup={noop}
        onDeleteGroup={noop}
        onRenameGroup={noop}
        onCopyGroup={noop}
      />
    </I18nContext.Provider>,
  );
}

describe('display', () => {
  it('renders 1,000+ saved tabs', () => {
    const groups = bigData(50, 25); // 1,250 tabs
    const started = performance.now();
    const html = render(groups);
    const elapsed = performance.now() - started;
    expect(html.match(/class="tab-row"/g)).toHaveLength(1250);
    expect(elapsed).toBeLessThan(3000);
  });

  it('escapes titles (no HTML injection)', () => {
    const html = render([{ id: 'g', name: '<img src=x onerror=alert(1)>', createdAt: 1, tabs: [{ id: 't', url: 'https://a.com/', title: '<script>x</script>', savedAt: 1 }] }]);
    expect(html).not.toContain('<script>x');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not render href for unsafe URLs', () => {
    const html = render([{ id: 'g', name: '', createdAt: 1, tabs: [{ id: 't', url: 'javascript:alert(1)', title: 'x', savedAt: 1 }] }]);
    expect(html).not.toContain('href="javascript');
  });

  it('shows the empty state', () => {
    expect(render([])).toContain(MESSAGES.ja.emptyTitle);
    expect(render([], true)).toContain(MESSAGES.ja.noMatches);
  });
});

describe('search', () => {
  const groups: TabGroup[] = [
    { id: 'g1', name: '', createdAt: 2, tabs: [
      { id: '1', url: 'https://github.com/foo', title: 'GitHub Foo', savedAt: 2 },
      { id: '2', url: 'https://news.example/', title: 'Daily NEWS', savedAt: 2 },
    ] },
    { id: 'g2', name: '', createdAt: 1, tabs: [{ id: '3', url: 'https://docs.example/github-guide', title: 'Guide', savedAt: 1 }] },
  ];
  it('matches title or URL, case-insensitively, across groups', () => {
    const r = filterGroups(groups, 'GITHUB');
    expect(r.map((g) => g.tabs.map((t) => t.id))).toEqual([['1'], ['3']]);
  });
  it('partial match on title', () => {
    expect(filterGroups(groups, 'news').flatMap((g) => g.tabs.map((t) => t.id))).toEqual(['2']);
  });
  it('empty query returns everything; no match returns nothing', () => {
    expect(filterGroups(groups, '  ')).toBe(groups);
    expect(filterGroups(groups, 'zzz')).toEqual([]);
  });
  it('searches 10,000 tabs quickly', () => {
    const big = bigData(100, 100);
    const t0 = performance.now();
    const r = filterGroups(big, 'site42.example/page/7');
    expect(performance.now() - t0).toBeLessThan(200);
    expect(r[0]!.tabs.map((t) => t.url)).toEqual(Array.from({ length: 11 }, (_, i) => `https://site42.example/page/${i === 0 ? 7 : 70 + i - 1}`));
  });
});

describe('i18n', () => {
  it('ja and en have the same keys and placeholders', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(MESSAGES.ja) as (keyof typeof MESSAGES.ja)[]) {
      expect(ph(MESSAGES.en[k])).toBe(ph(MESSAGES.ja[k]));
    }
  });
});
