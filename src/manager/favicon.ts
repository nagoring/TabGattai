/**
 * Favicon URL via Chrome's local favicon cache (requires the "favicon" permission).
 * No network request is made and no image data is stored by TabMerge.
 */
export function faviconUrl(pageUrl: string, size = 32): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}
