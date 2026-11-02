/**
 * URL rules.
 *
 * - Which URLs can be saved / reopened (scheme allow-list).
 * - The duplicate key used for "latest wins" merging.
 */

/** Schemes that TabMerge saves and is willing to open. Everything else (javascript:, data:, chrome:, ...) is rejected. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/** Upper bound for a stored URL; protects storage from absurd input. */
export const MAX_URL_LENGTH = 8192;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** True for URLs of normal web pages that can be saved (http, https, file). */
export function isSavableUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return false;
  const u = parse(url);
  return u !== null && ALLOWED_PROTOCOLS.has(u.protocol);
}

/**
 * True when the URL may be opened from TabMerge.
 * Same allow-list as saving: dangerous schemes such as javascript:, data:, vbscript:, blob:,
 * chrome:, chrome-extension: are refused.
 */
export function isSafeToOpen(url: unknown): url is string {
  return isSavableUrl(url);
}

/**
 * Duplicate-detection key.
 *
 * Version 1 rule: exact match of the URL string obtained from the browser.
 *  - fragment (#...) is significant
 *  - query parameters are significant
 *  - trailing slash differences are NOT merged
 *  - no case folding
 *
 * Kept as a standalone function so that configurable normalization can be added later
 * without touching the merge logic.
 */
export function duplicateKey(url: string): string {
  return url;
}

/** Signature of a duplicate-key function, for injecting alternative rules in the future / tests. */
export type DuplicateKeyFn = (url: string) => string;
