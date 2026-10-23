// Display helpers that depend on the current language: amounts from cents, dates, statuses and
// history lines (stored as codes, written out here).
import { useCallback } from 'react';
import type { InvoiceView, QuoteView } from './domain/catalog';
import { isoDate, statusOf } from './domain/rules';
import type { Doc, HistoryEntry } from './domain/schema';
import { useI18n, type Key } from './i18n';

export function useFormat() {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const money = useCallback((cents: number) => i18n.money(cents / 100, 2), [i18n]);
  const money0 = useCallback((cents: number) => i18n.money(cents / 100, 0), [i18n]);
  const compact = useCallback((cents: number) => {
    const v = cents / 100;
    return v >= 1000 ? `${(v / 1000).toLocaleString(locale, { maximumFractionDigits: v >= 10000 ? 0 : 1 })} k€` : `${Math.round(v)} €`;
  }, [locale]);
  const shortDate = useCallback((iso: string) => i18n.date(iso, { day: 'numeric', month: 'short', year: 'numeric' }), [i18n]);
  const longDate = useCallback((iso: string) => i18n.date(iso, { day: 'numeric', month: 'long', year: 'numeric' }), [i18n]);
  const time = (iso: string) => (iso.length > 10 ? iso.slice(11, 16) : '');
  const qty = useCallback((n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 }), [locale]);
  const status = useCallback((d: Doc, today = isoDate(new Date())) => t(`status.${d.kind}.${statusOf(d, today)}` as Key), [t]);
  const statusLabel = useCallback((kind: Doc['kind'], s: QuoteView | InvoiceView) => t(`status.${kind}.${s}` as Key), [t]);
  const docName = useCallback((d: Pick<Doc, 'kind' | 'number'>) => `${t(d.kind === 'quote' ? 'doc.quote' : 'doc.invoice')} ${d.number || t('doc.draft')}`, [t]);
  const history = useCallback((h: HistoryEntry) => {
    const ref = h.type === 'paid' ? (h.ref === 'online' ? t('history.online') : h.ref ? t(`pay.${h.ref}` as Key).toLowerCase() : '') : h.ref === 'paper' ? t('history.paper') : h.ref === 'online' ? t('history.online') : h.ref;
    return t(`history.${h.type}` as Key, { by: h.by || t('history.client'), ref, note: h.note ? ` « ${h.note} »` : '' });
  }, [t]);
  return { ...i18n, money, money0, compact, shortDate, longDate, time, qty, status, statusLabel, docName, history };
}
