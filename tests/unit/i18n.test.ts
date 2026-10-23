// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HISTORY_TYPES, INVOICE_STATUSES, PAY_METHODS, QUOTE_STATUSES } from '../../src/domain/catalog';
import { dictionaries } from '../../src/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const fr = Object.entries(dictionaries.fr);
  it('has every French key in English, and nothing more', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(fr.map(([k]) => k).sort());
  });
  it('has no empty string and the same placeholders in both languages', () => {
    for (const [k, v] of fr) {
      expect(v.trim(), k).not.toBe('');
      expect(placeholders(dictionaries.en[k as keyof typeof dictionaries.en]), k).toEqual(placeholders(v));
    }
  });
  it('covers every key built at run time (statuses, history events, payment methods, errors)', () => {
    const keys = new Set(Object.keys(dictionaries.fr));
    const expected = [
      ...[...QUOTE_STATUSES, 'expired'].map((s) => `status.quote.${s}`),
      ...[...INVOICE_STATUSES, 'late'].map((s) => `status.invoice.${s}`),
      ...HISTORY_TYPES.map((h) => `history.${h}`),
      ...PAY_METHODS.map((m) => `pay.${m}`),
      ...['forbidden', 'invalid', 'not-found'].map((e) => `err.${e}`),
      ...['checking', 'valid', 'tampered', 'none'].map((p) => `proof.${p}`),
    ];
    for (const k of expected) expect(keys.has(k), k).toBe(true);
  });
});
