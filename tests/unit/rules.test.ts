// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays, lastMonths, lineTotal, nextNumber, numberingProblems, proofPayload, statusOf, totals } from '../../src/domain/rules';
import { stateSchema, type Doc, type Invoice, type Quote } from '../../src/domain/schema';
import { seed } from '../../src/domain/seed';

const line = (qty: number, price: number, vat: 20 | 10 | 5.5 = 20) => ({ label: 'x', qty, unit: 'u' as const, price, vat });

describe('totals (integer cents)', () => {
  it('rounds each line to the cent', () => {
    expect(lineTotal({ qty: 2.5, price: 3333 })).toBe(8333); // 83.325 € -> 83.33 €
  });
  it('computes VAT once per rate on its base, highest rate first', () => {
    const t = totals([line(1, 10000), line(3, 1999, 5.5), line(1, 5000, 10), line(2, 2500)]);
    expect(t.ht).toBe(10000 + 5997 + 5000 + 5000);
    expect(t.vats).toEqual([
      { rate: 20, base: 15000, amount: 3000 },
      { rate: 10, base: 5000, amount: 500 },
      { rate: 5.5, base: 5997, amount: 330 }, // 329.835 rounds once, on the base
    ]);
    expect(t.ttc).toBe(t.ht + 3830);
  });
  it('is zero for no lines', () => {
    expect(totals([])).toEqual({ ht: 0, vats: [], vat: 0, ttc: 0 });
  });
});

describe('statuses computed from dates', () => {
  const base = { id: 'd1', client: 'c1', date: '2026-01-01', subject: 's', notes: '', lines: [], history: [], number: '' };
  const quote: Quote = { ...base, kind: 'quote', status: 'sent', validUntil: '2026-01-31', signedBy: '', acceptedAt: '', fingerprint: '' };
  const invoice: Invoice = { ...base, kind: 'invoice', status: 'issued', due: '2026-01-31', paidAt: '', payMethod: '', reminders: 0 };
  it('a sent quote past its validity is expired, an accepted one is not', () => {
    expect(statusOf(quote, '2026-01-31')).toBe('sent');
    expect(statusOf(quote, '2026-02-01')).toBe('expired');
    expect(statusOf({ ...quote, status: 'accepted' }, '2026-03-01')).toBe('accepted');
  });
  it('an unpaid invoice past its due date is late, a paid one is not', () => {
    expect(statusOf(invoice, '2026-02-01')).toBe('late');
    expect(statusOf({ ...invoice, status: 'paid' }, '2026-03-01')).toBe('paid');
  });
});

describe('numbering', () => {
  it('counts per kind and per year, padded', () => {
    expect(nextNumber({}, 'invoice', '2026-03-02')).toEqual({ number: 'F-2026-0001', key: 'F2026', value: 1 });
    expect(nextNumber({ F2026: 41, D2026: 3 }, 'invoice', '2026-12-31').number).toBe('F-2026-0042');
    expect(nextNumber({ F2026: 41 }, 'invoice', '2027-01-01').number).toBe('F-2027-0001');
    expect(nextNumber({ D2026: 3 }, 'quote', '2026-05-05').number).toBe('D-2026-0004');
  });
  it('detects gaps and numbers out of date order', () => {
    const inv = (number: string, date: string) => ({ kind: 'invoice', number, date }) as Doc;
    expect(numberingProblems([inv('F-2026-0001', '2026-01-02'), inv('F-2026-0002', '2026-01-05')])).toEqual([]);
    expect(numberingProblems([inv('F-2026-0001', '2026-01-02'), inv('F-2026-0003', '2026-01-05')])).toHaveLength(1);
    expect(numberingProblems([inv('F-2026-0001', '2026-01-09'), inv('F-2026-0002', '2026-01-05')])).toHaveLength(1);
  });
});

describe('dates', () => {
  it('lists the last months, current one last', () => {
    expect(lastMonths(3, '2026-01-15')).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });
});

describe('proof payload', () => {
  it('commits to number, client, lines, total, signer and time, in a stable order', () => {
    const d = { number: 'D-2026-0001', client: 'c1', lines: [line(2, 1000)] };
    const p = proofPayload(d, 'Léa Roux', '2026-01-02T10:00:00');
    expect(JSON.parse(p)).toEqual({ number: 'D-2026-0001', client: 'c1', lines: [['x', 2, 'u', 1000, 20]], ttc: 2400, signedBy: 'Léa Roux', at: '2026-01-02T10:00:00' });
    expect(proofPayload({ ...d, lines: [line(3, 1000)] }, 'Léa Roux', '2026-01-02T10:00:00')).not.toBe(p);
  });
});

describe('seed data', () => {
  const state = seed(new Date(2026, 9, 23, 12));
  it('passes the stored-data validation', () => {
    expect(stateSchema.safeParse(state).success).toBe(true);
  });
  it('numbers invoices without gaps, in date order', () => {
    expect(numberingProblems(state.docs)).toEqual([]);
    expect(state.docs.filter((d) => d.kind === 'invoice').length).toBeGreaterThan(20);
  });
  it('invoices copy their accepted quote, and are paid after being issued', () => {
    for (const inv of state.docs.filter((d): d is Invoice => d.kind === 'invoice')) {
      const q = state.docs.find((d) => d.id === inv.quote);
      expect(q?.status).toBe('accepted');
      expect(inv.lines).toEqual(q?.lines);
      if (inv.status === 'paid') expect(inv.paidAt >= inv.date).toBe(true);
    }
  });
  it('drafts have no number, everything else does', () => {
    for (const d of state.docs) expect(d.status === 'draft' ? d.number === '' : d.number !== '').toBe(true);
  });
});
