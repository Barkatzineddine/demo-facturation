// Typed i18n: the English dictionary must have exactly the keys of the French one (checked by
// TypeScript and by a unit test), with {placeholders} filled at render time.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'fr' | 'en';
export type Dict = Record<string, string>;

export interface I18n<K extends string> {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: K, vars?: Record<string, string | number>) => string;
  money: (value: number, digits?: number) => string;
  date: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  return vars ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : template;
}

export function createI18n<K extends string>(dicts: Record<Lang, Record<K, string>>, storageKey: string) {
  const Context = createContext<I18n<K> | null>(null);

  const initialLang = (): Lang => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'fr' || saved === 'en') return saved;
    } catch { /* storage blocked */ }
    return 'fr';
  };

  function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(initialLang);
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
    useEffect(() => { document.documentElement.lang = lang; }, [lang]);
    const setLang = useCallback((next: Lang) => {
      setLangState(next);
      try { localStorage.setItem(storageKey, next); } catch { /* storage blocked */ }
    }, []);
    const value = useMemo<I18n<K>>(() => {
      const money = (v: number, digits = 2) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
      return {
        lang, locale, setLang,
        t: (key, vars) => interpolate(dicts[lang][key], vars),
        money,
        date: (iso, options = { weekday: 'long', day: 'numeric', month: 'long' }) => {
          const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
          return new Intl.DateTimeFormat(locale, options).format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
        },
      };
    }, [lang, locale, setLang]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useI18n(): I18n<K> {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('useI18n outside I18nProvider');
    return ctx;
  }

  return { I18nProvider, useI18n };
}
