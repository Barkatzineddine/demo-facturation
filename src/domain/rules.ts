// Dates, totals and French invoicing rules. Pure functions, shared by the interface, the PDF and the tests.
import type { InvoiceView, QuoteView } from './catalog';
import type { Doc, Line, State } from './schema';

// ---------- dates (local calendar days as YYYY-MM-DD) ----------
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export const daysBetween = (from: string, to: string): number => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 864e5);
/** Local date and time, to the second: what history entries and signatures record. */
export const localStamp = (d = new Date()): string => `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
export const monthKey = (iso: string): string => iso.slice(0, 7);
export function lastMonths(n: number, today: string): string[] {
  const d = parseDate(today);
  return Array.from({ length: n }, (_, i) => isoDate(new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1)).slice(0, 7));
}

// ---------- totals (integer cents) ----------
export const lineTotal = (l: Pick<Line, 'qty' | 'price'>): number => Math.round(l.qty * l.price);

export interface Totals { ht: number; vats: { rate: number; base: number; amount: number }[]; vat: number; ttc: number }

/** HT per line, VAT computed once per rate on that rate's base (not per line), TTC. */
export function totals(lines: readonly Pick<Line, 'qty' | 'price' | 'vat'>[]): Totals {
  const byRate = new Map<number, number>();
  let ht = 0;
  for (const l of lines) {
    const t = lineTotal(l);
    ht += t;
    byRate.set(l.vat, (byRate.get(l.vat) ?? 0) + t);
  }
  const vats = [...byRate].sort((a, b) => b[0] - a[0]).map(([rate, base]) => ({ rate, base, amount: Math.round((base * rate) / 100) }));
  const vat = vats.reduce((s, v) => s + v.amount, 0);
  return { ht, vats, vat, ttc: ht + vat };
}

// ---------- statuses ----------
/** A sent quote past its validity is expired; an unpaid issued invoice past its due date is late. */
export function statusOf(doc: Doc, today: string): QuoteView | InvoiceView {
  if (doc.kind === 'quote') return doc.status === 'sent' && doc.validUntil < today ? 'expired' : doc.status;
  return doc.status === 'issued' && doc.due < today ? 'late' : doc.status;
}

// ---------- numbering ----------
/**
 * Next number for a kind and year: sequential, no gaps, in date order (a legal requirement for
 * invoices). Numbers are only given when a quote is sent or an invoice issued, never to drafts.
 */
export function nextNumber(seq: State['seq'], kind: Doc['kind'], date: string): { number: string; key: string; value: number } {
  const prefix = kind === 'quote' ? 'D' : 'F';
  const year = date.slice(0, 4);
  const key = `${prefix}${year}`;
  const value = (seq[key] ?? 0) + 1;
  return { number: `${prefix}-${year}-${String(value).padStart(4, '0')}`, key, value };
}

/** Invoices whose numbers are out of date order or have gaps (should always be empty). */
export function numberingProblems(docs: readonly Doc[]): string[] {
  const issued = docs.filter((d) => d.kind === 'invoice' && d.number).sort((a, b) => a.number.localeCompare(b.number));
  const problems: string[] = [];
  const byYear = new Map<string, Doc[]>();
  for (const d of issued) byYear.set(d.number.slice(2, 6), [...(byYear.get(d.number.slice(2, 6)) ?? []), d]);
  for (const [year, list] of byYear) {
    list.forEach((d, i) => {
      if (Number(d.number.slice(7)) !== i + 1) problems.push(`gap before ${d.number} (${year})`);
      const prev = list[i - 1];
      if (prev && prev.date > d.date) problems.push(`${d.number} dated before ${prev.number}`);
    });
  }
  return problems;
}

// ---------- acceptance proof ----------
/** What a signature commits to: number, client, lines, total, signer and time, in a fixed order. */
export function proofPayload(doc: Pick<Doc, 'number' | 'client' | 'lines'>, signedBy: string, at: string): string {
  return JSON.stringify({ number: doc.number, client: doc.client, lines: doc.lines.map((l) => [l.label, l.qty, l.unit, l.price, l.vat]), ttc: totals(doc.lines).ttc, signedBy, at });
}
