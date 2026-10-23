// Demo data: ten clients and 14 months of quotes and invoices, numbered in date order without gaps.
import { CATALOG, PAY_METHODS, type Unit, type VatRate } from './catalog';
import { addDays, isoDate, lineTotal, nextNumber } from './rules';
import type { Client, Doc, HistoryEntry, Invoice, Line, Quote, State } from './schema';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLIENTS: Omit<Client, 'id' | 'token' | 'email' | 'phone' | 'siret' | 'created'>[] = [
  { type: 'pro', name: 'Boulangerie Lafitte', contact: 'Sandrine Lafitte', city: 'Bordeaux', zip: '33000', address: '4 cours de l’Intendance' },
  { type: 'pro', name: 'Cabinet dentaire des Chartrons', contact: 'Dr Marc Olivier', city: 'Bordeaux', zip: '33300', address: '18 rue Notre-Dame' },
  { type: 'pro', name: 'SCI Les Capucins', contact: 'Hélène Durand', city: 'Bordeaux', zip: '33800', address: '7 place des Capucins' },
  { type: 'part', name: 'Élodie Garnier', contact: 'Élodie Garnier', city: 'Mérignac', zip: '33700', address: '22 avenue de la Marne' },
  { type: 'part', name: 'Karim Benali', contact: 'Karim Benali', city: 'Pessac', zip: '33600', address: '9 allée des Pins' },
  { type: 'pro', name: 'Bistrot du Quai', contact: 'Julien Maréchal', city: 'Bordeaux', zip: '33000', address: '3 quai Richelieu' },
  { type: 'pro', name: 'Agence Pierre & Pin', contact: 'Claire Mounier', city: 'Arcachon', zip: '33120', address: '15 boulevard de la Plage' },
  { type: 'part', name: 'Thomas et Léa Roux', contact: 'Léa Roux', city: 'Talence', zip: '33400', address: '31 rue Pacaris' },
  { type: 'pro', name: 'Crèche Les Petits Pins', contact: 'Nadia Belkacem', city: 'Bègles', zip: '33130', address: '2 rue Calixte-Camelle' },
  { type: 'pro', name: 'Studio Yoga Lumière', contact: 'Inès Carpentier', city: 'Bordeaux', zip: '33000', address: '40 rue Sainte-Catherine' },
];

export const VAT_NOTE = 'TVA à 10 % : travaux d’amélioration dans un logement achevé depuis plus de 2 ans (attestation du client).';
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function seed(now = new Date(), token: () => string = () => ''): State {
  const today = isoDate(now);
  const r = rng(Number(today.replace(/-/g, '')));
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;
  let n = 0;
  const id = (prefix: string) => `${prefix}${(++n).toString(36).padStart(5, '0')}${Math.floor(r() * 36 ** 3).toString(36)}`;
  const makeToken = () => token() || Array.from({ length: 16 }, () => pick([...TOKEN_ALPHABET])).join('');
  const entry = (at: string, type: HistoryEntry['type'], by = '', ref = ''): HistoryEntry => ({ at, type, by, ref, note: '' });
  const state: State = { v: 2, clients: [], docs: [], seq: {} };

  state.clients = CLIENTS.map((c, i) => ({
    ...c, id: id('c'), token: makeToken(),
    email: `${(c.contact.replace(/^Dr\s+/, '').split(' ')[0] ?? 'contact').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')}@example.com`,
    phone: `06 39 98 ${String(20 + i * 7).padStart(2, '0')} ${String(11 + i * 5).padStart(2, '0')}`,
    siret: c.type === 'pro' ? `${String(800000000 + i * 1234567).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} 000${10 + i}` : '',
    created: addDays(today, -420 + i * 9),
  }));

  const makeLines = (vat: VatRate): Line[] => {
    const lines: Line[] = [];
    const used = new Set<number>();
    for (let count = 2 + Math.floor(r() * 3); lines.length < count;) {
      const i = Math.floor(r() * CATALOG.length);
      if (used.has(i)) continue;
      used.add(i);
      const c = CATALOG[i] as (typeof CATALOG)[number];
      const qtyBy: Record<Unit, () => number> = { forfait: () => 1, h: () => 4 + Math.floor(r() * 30), 'm²': () => 12 + Math.floor(r() * 50), ml: () => 2 + Math.floor(r() * 5), u: () => 1 + Math.floor(r() * 4) };
      lines.push({ label: c.label, qty: qtyBy[c.unit](), unit: c.unit, price: c.price, vat });
    }
    return lines;
  };
  const subjectOf = (lines: Line[]) => {
    const main = [...lines].sort((a, b) => lineTotal(b) - lineTotal(a))[0];
    return main ? (main.label.split(',')[0] ?? main.label).slice(0, 60) : 'Travaux de menuiserie';
  };
  const quote = (c: Client, date: string, status: Quote['status'], lines: Line[]): Quote => ({
    kind: 'quote', id: id('d'), client: c.id, date, validUntil: addDays(date, 30), status, number: '', subject: subjectOf(lines), lines,
    notes: c.type === 'part' ? VAT_NOTE : '', signedBy: '', acceptedAt: '', fingerprint: '', history: [entry(date, 'created', 'Antoine Morel')],
  });

  // 14 months of quotes: about 60 % accepted and invoiced, the rest refused or left unanswered
  const events: { date: string; client: Client }[] = [];
  for (let m = 13; m >= 0; m--) {
    for (let k = 0, count = 3 + Math.floor(r() * 3); k < count; k++) {
      events.push({ date: addDays(today, -m * 30 - Math.floor(r() * 28) - 20), client: pick(state.clients) });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  for (const ev of events) {
    const c = ev.client;
    const lines = makeLines(c.type === 'part' ? 10 : 20);
    const accepted = addDays(ev.date, 3 + Math.floor(r() * 10));
    const invDate = addDays(accepted, 10 + Math.floor(r() * 20));
    const outcome = r();
    if (outcome >= 0.58 && addDays(ev.date, 30) < today) {
      const refused = outcome < 0.8;
      const q = quote(c, ev.date, refused ? 'refused' : 'sent', lines);
      q.history.push(entry(addDays(ev.date, 1), 'sent', 'Antoine Morel'));
      if (refused) q.history.push(entry(addDays(ev.date, 6 + Math.floor(r() * 10)), 'refused', c.contact));
      state.docs.push(q);
      continue;
    }
    if (invDate > today) continue;
    const q = quote(c, ev.date, 'accepted', lines);
    q.signedBy = c.contact;
    q.acceptedAt = `${accepted}T10:${String(10 + Math.floor(r() * 40))}:00`;
    q.history.push(entry(addDays(ev.date, 1), 'sent', 'Antoine Morel'), entry(q.acceptedAt, 'accepted', c.contact, 'online'));
    const paidAt = addDays(invDate, 5 + Math.floor(r() * 50));
    const paid = addDays(invDate, 75) < today || (paidAt <= today && r() > 0.3);
    const inv: Invoice = {
      kind: 'invoice', id: id('f'), client: c.id, date: invDate, due: addDays(invDate, 30), status: paid ? 'paid' : 'issued', number: '',
      subject: q.subject, lines: lines.map((l) => ({ ...l })), notes: q.notes, quote: q.id, paidAt: paid ? paidAt : '',
      payMethod: paid ? (PAY_METHODS[Math.floor(r() * 3)] ?? 'transfer') : '', reminders: 0, history: [],
    };
    q.invoice = inv.id;
    state.docs.push(q, inv);
  }

  // the open pipeline: quotes waiting for an answer, one refused, one draft, one accepted to invoice
  const open: [number, number, Quote['status']][] = [[0, -6, 'sent'], [5, -12, 'sent'], [7, -3, 'sent'], [2, -40, 'refused'], [9, -50, 'sent'], [3, -1, 'draft'], [1, -18, 'accepted']];
  for (const [ci, offset, status] of open) {
    const c = state.clients[ci] as Client;
    const date = addDays(today, offset);
    const q = quote(c, date, status, makeLines(c.type === 'part' ? 10 : 20));
    if (status !== 'draft') q.history.push(entry(date, 'sent', 'Antoine Morel'));
    if (status === 'refused') q.history.push(entry(addDays(date, 9), 'refused', c.contact));
    if (status === 'accepted') {
      q.signedBy = c.contact;
      q.acceptedAt = `${addDays(date, 4)}T16:42:00`;
      q.history.push(entry(q.acceptedAt, 'accepted', c.contact, 'online'));
    }
    state.docs.push(q);
  }

  // numbers follow the date order without gaps
  const byDate = (a: Doc, b: Doc) => a.date.localeCompare(b.date);
  for (const kind of ['quote', 'invoice'] as const) {
    for (const d of state.docs.filter((x) => x.kind === kind && x.status !== 'draft').sort(byDate)) {
      const next = nextNumber(state.seq, kind, d.date);
      state.seq[next.key] = next.value;
      d.number = next.number;
    }
  }
  for (const inv of state.docs.filter((d): d is Invoice => d.kind === 'invoice')) {
    const q = state.docs.find((d) => d.id === inv.quote);
    if (!q) continue;
    inv.history = [entry(inv.date, 'issued', 'Antoine Morel', q.number), ...(inv.paidAt ? [entry(inv.paidAt, 'paid', '', inv.payMethod)] : [])];
    q.history.push(entry(inv.date, 'converted', 'Antoine Morel', inv.number));
  }
  return state;
}
