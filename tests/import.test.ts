import { buildExport, EXPORT_FORMAT, ImportError, parseImport } from '../src/core/importExport';
import { importJson, saveWindow } from '../src/core/services';
import { FakeTabs, group, newStore, urlsOf } from './helpers';

const NOW = Date.parse('2026-11-02T00:00:00Z');
const file = (groups: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, exportedAt: new Date(NOW).toISOString(), groups, ...extra });
const g = (id: string, createdAt: string, tabs: { id?: unknown; url: unknown; title?: unknown; savedAt?: unknown }[], name = '') => ({
  id,
  name,
  createdAt,
  tabs: tabs.map((t, i) => ({ id: `${id}-t${i}`, title: 'title', savedAt: createdAt, ...t })),
});

describe('export', () => {
  it('contains version, ids, names, ISO dates, urls and titles (no favicon data)', () => {
    const out = buildExport({ groups: [group('g1', NOW, ['https://a.com/'], 'Work')] }, NOW);
    expect(out).toMatchObject({ format: EXPORT_FORMAT, formatVersion: 1, exportedAt: '2026-11-02T00:00:00.000Z' });
    expect(out.groups[0]).toMatchObject({ id: 'g1', name: 'Work', createdAt: '2026-11-02T00:00:00.000Z' });
    expect(Object.keys(out.groups[0]!.tabs[0]!).sort()).toEqual(['id', 'savedAt', 'title', 'url']);
  });

  it('still imports backups written under the former format name', () => {
    const text = JSON.stringify({ format: 'tabmerge-export', formatVersion: 1, groups: [g('g1', '2026-11-01T00:00:00.000Z', [{ url: 'https://a.com/' }])] });
    expect(urlsOf(parseImport(text).groups[0])).toEqual(['https://a.com/']);
  });

  it('round-trips through import', async () => {
    const { store } = newStore();
    const text = JSON.stringify(buildExport({ groups: [group('g1', NOW - 10, ['https://a.com/', 'https://b.com/'], 'X')] }));
    await importJson(store, text, NOW);
    const data = await store.read();
    expect(data.groups[0]).toMatchObject({ id: 'g1', name: 'X', createdAt: NOW - 10 });
    expect(urlsOf(data.groups[0])).toEqual(['https://a.com/', 'https://b.com/']);
  });
});

describe('parseImport validation', () => {
  it('accepts a valid file', () => {
    const r = parseImport(file([g('g1', '2026-11-01T00:00:00Z', [{ url: 'https://a.com/' }])]), new Set(), NOW);
    expect(r.stats).toMatchObject({ groups: 1, tabs: 1, invalidUrls: 0, regeneratedIds: 0 });
  });

  it.each([
    ['broken JSON', '{"format": ', 'invalid-json'],
    ['not an object', '[]', 'invalid-format'],
    ['wrong format marker', JSON.stringify({ format: 'onetab', formatVersion: 1, groups: [] }), 'invalid-format'],
    ['groups not an array', JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, groups: {} }), 'invalid-format'],
    ['missing version', JSON.stringify({ format: EXPORT_FORMAT, groups: [] }), 'invalid-format'],
    ['unsupported (future) version', JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 2, groups: [] }), 'unsupported-version'],
  ])('rejects %s', (_name, text, code) => {
    try {
      parseImport(text, new Set(), NOW);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).code).toBe(code);
    }
  });

  it('drops invalid URLs and malformed entries but keeps the rest', () => {
    const r = parseImport(
      file([
        g('g1', '2026-11-01T00:00:00Z', [
          { url: 'https://ok.com/' },
          { url: 'javascript:alert(1)' },
          { url: 'data:text/html,x' },
          { url: 'chrome://settings' },
          { url: 'not a url' },
          { url: 12345 },
        ]),
        'garbage',
        { id: 'g2', tabs: 'nope' },
        g('g3', '2026-11-01T00:00:00Z', [{ url: 'ftp://x' }]),
      ]),
      new Set(),
      NOW,
    );
    expect(r.groups).toHaveLength(1);
    expect(urlsOf(r.groups[0])).toEqual(['https://ok.com/']);
    expect(r.stats.invalidUrls).toBe(6);
    expect(r.stats.invalidEntries).toBe(2);
  });

  it('clamps future / invalid timestamps and regenerates bad or colliding IDs', () => {
    const r = parseImport(
      file([
        g('bad id with spaces', '2999-01-01T00:00:00Z', [
          { url: 'https://a.com/', id: '<script>', savedAt: 'yesterday' },
          { url: 'https://b.com/', id: 'dup', savedAt: -5 },
          { url: 'https://c.com/', id: 'dup' },
          { url: 'https://d.com/', id: 'existing' },
        ]),
      ]),
      new Set(['existing']),
      NOW,
    );
    const grp = r.groups[0]!;
    expect(grp.createdAt).toBe(NOW);
    expect(grp.id).not.toBe('bad id with spaces');
    const ids = grp.tabs.map((t) => t.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain('<script>');
    expect(ids).not.toContain('existing');
    expect(grp.tabs.every((t) => t.savedAt <= NOW && t.savedAt >= 0)).toBe(true);
    expect(r.stats.regeneratedIds).toBe(4);
  });

  it('sanitizes titles and names (control chars, length) and falls back to URL for empty titles', () => {
    const r = parseImport(
      file([g('g1', '2026-11-01T00:00:00Z', [{ url: 'https://a.com/', title: 'a\u0000b\nc' }, { url: 'https://b.com/', title: 42 }], 'n'.repeat(500))]),
      new Set(),
      NOW,
    );
    expect(r.groups[0]!.tabs.map((t) => t.title)).toEqual(['a b c', 'https://b.com/']);
    expect(r.groups[0]!.name.length).toBe(200);
  });
});

describe('importJson merge', () => {
  async function storeWithSaved(urls: string[], now: number) {
    const env = newStore();
    const tabs = new FakeTabs();
    tabs.addWindow(1, urls.map((url) => ({ url })));
    await saveWindow(env.store, tabs, { windowId: 1, ownPagePrefix: 'x', now });
    return env;
  }

  it('newer imported group takes duplicates from older existing groups', async () => {
    const { store } = await storeWithSaved(['https://a.com/', 'https://b.com/'], NOW - 1000);
    await importJson(store, file([g('imp', new Date(NOW - 10).toISOString(), [{ url: 'https://b.com/' }, { url: 'https://c.com/' }])]), NOW);
    const data = await store.read();
    expect(data.groups.map(urlsOf)).toEqual([['https://b.com/', 'https://c.com/'], ['https://a.com/']]);
  });

  it('older imported group loses duplicates to newer existing groups', async () => {
    const { store } = await storeWithSaved(['https://a.com/'], NOW - 10);
    await importJson(store, file([g('imp', new Date(NOW - 1000).toISOString(), [{ url: 'https://a.com/' }, { url: 'https://z.com/' }])]), NOW);
    const data = await store.read();
    expect(data.groups.map(urlsOf)).toEqual([['https://a.com/'], ['https://z.com/']]);
  });

  it('importing the same JSON several times does not duplicate anything', async () => {
    const { store } = newStore();
    const text = file([
      g('g1', '2026-10-01T00:00:00Z', [{ url: 'https://a.com/' }, { url: 'https://b.com/' }]),
      g('g2', '2026-10-02T00:00:00Z', [{ url: 'https://c.com/' }]),
    ]);
    await importJson(store, text, NOW);
    const once = await store.read();
    await importJson(store, text, NOW);
    await importJson(store, text, NOW);
    const thrice = await store.read();
    expect(thrice.groups).toEqual(once.groups);
  });

  it('a rejected import leaves existing data untouched', async () => {
    const { store, backend } = await storeWithSaved(['https://a.com/'], NOW);
    const writes = backend.writes;
    await expect(importJson(store, '{oops', NOW)).rejects.toThrow(ImportError);
    expect(backend.writes).toBe(writes);
    expect(urlsOf((await store.read()).groups[0])).toEqual(['https://a.com/']);
  });

  it('a file with only invalid URLs does not write', async () => {
    const { store, backend } = newStore();
    const r = await importJson(store, file([g('g1', '2026-10-01T00:00:00Z', [{ url: 'javascript:x' }])]), NOW);
    expect(r.stats.invalidUrls).toBe(1);
    expect(backend.writes).toBe(0);
  });
});
