import { DEFAULT_SETTINGS, type Settings } from './types';

/** Builds a valid Settings object from untrusted input, falling back to defaults per field. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    includePinned: typeof r.includePinned === 'boolean' ? r.includePinned : DEFAULT_SETTINGS.includePinned,
    removeOnRestore: typeof r.removeOnRestore === 'boolean' ? r.removeOnRestore : DEFAULT_SETTINGS.removeOnRestore,
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULT_SETTINGS.theme,
    language: r.language === 'en' || r.language === 'ja' ? r.language : DEFAULT_SETTINGS.language,
  };
}
