import { createContext, useContext } from 'react';
import type { LanguageSetting } from '../core/types';
import { MESSAGES, type MessageKey } from './messages';

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function makeTranslator(lang: LanguageSetting): Translate {
  const dict = MESSAGES[lang] ?? MESSAGES.ja;
  return (key, params) => {
    const template = dict[key] ?? MESSAGES.ja[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
  };
}

export function formatDateTime(ms: number, lang: LanguageSetting): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

export interface I18n {
  t: Translate;
  lang: LanguageSetting;
}

export const I18nContext = createContext<I18n>({ t: makeTranslator('ja'), lang: 'ja' });
export const useI18n = () => useContext(I18nContext);
