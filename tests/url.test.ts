import { duplicateKey, isSafeToOpen, isSavableUrl } from '../src/core/url';

describe('url rules', () => {
  it.each(['https://example.com/', 'http://a.b/c?d#e', 'file:///home/x.html'])('savable: %s', (u) => {
    expect(isSavableUrl(u)).toBe(true);
  });
  it.each([
    'chrome://extensions',
    'chrome-extension://abc/manager.html',
    'about:blank',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'blob:https://e.com/1',
    'view-source:https://e.com',
    'edge://settings',
    'not a url',
    '',
  ])('rejected: %s', (u) => {
    expect(isSavableUrl(u)).toBe(false);
    expect(isSafeToOpen(u)).toBe(false);
  });
  it('rejects non-strings and huge URLs', () => {
    expect(isSavableUrl(null)).toBe(false);
    expect(isSavableUrl(42)).toBe(false);
    expect(isSavableUrl('https://e.com/' + 'a'.repeat(9000))).toBe(false);
  });
  it('duplicateKey is the exact URL string', () => {
    expect(duplicateKey('https://E.com/a/')).toBe('https://E.com/a/');
  });
});
