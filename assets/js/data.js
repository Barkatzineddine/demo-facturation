// Company, catalogue, seed history, totals, numbering and state validation.
import { uid, isoDate, addDays, parseDate } from './core.js';

export const STORE_KEY = 'morel:v1';

export const COMPANY = {
  name: 'Morel Agencement',
  legal: 'SARL au capital de 10 000 €',
  activity: 'Menuiserie et agencement sur mesure',
  address: '12 rue des Menuisiers', zip: '33000', city: 'Bordeaux',
  phone: '05 36 49 12 34', email: 'contact@morel-agencement.example',
  siret: '123 456 789 00012', vat: 'FR00 123456789', rcs: 'RCS Bordeaux 123 456 789',
  iban: 'FR76 3000 0000 0000 0000 0000 000', bic: 'DEMOFRPPXXX',
};

export const UNITS = ['u', 'forfait', 'h', 'm²', 'ml'];
export const VAT_RATES = [20, 10, 5.5];

export const CATALOG = [
  { label: 'Cuisine sur mesure, façades chêne massif', unit: 'forfait', price: 6800 },
  { label: 'Plan de travail chêne huilé', unit: 'ml', price: 320 },
  { label: 'Dressing sur mesure', unit: 'ml', price: 890 },
  { label: 'Bibliothèque murale en noyer', unit: 'ml', price: 760 },
  { label: 'Fourniture parquet chêne massif 14 mm', unit: 'm²', price: 54 },
  { label: 'Pose de parquet chêne, collé', unit: 'm²', price: 38 },
  { label: 'Ponçage et vitrification', unit: 'm²', price: 24 },
  { label: 'Escalier quart tournant en hêtre', unit: 'forfait', price: 5400 },
  { label: 'Comptoir d’accueil sur mesure', unit: 'forfait', price: 4200 },
  { label: 'Banquette coffre sur mesure', unit: 'ml', price: 540 },
  { label: 'Porte intérieure chêne, pose comprise', unit: 'u', price: 690 },
  { label: 'Quincaillerie Blum (lot)', unit: 'u', price: 185 },
  { label: 'Main-d’œuvre menuisier', unit: 'h', price: 52 },
  { label: 'Déplacement et protection du chantier', unit: 'forfait', price: 90 },
];

export const QUOTE_STATUS = { brouillon: 'Brouillon', 'envoyé': 'Envoyé', 'accepté': 'Accepté', 'refusé': 'Refusé', 'expiré': 'Expiré' };
export const INVOICE_STATUS = { brouillon: 'Brouillon', 'émise': 'À payer', retard: 'En retard', 'payée': 'Payée' };
export const PAY_METHODS = ['Virement', 'Carte bancaire', 'Chèque', 'Espèces'];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const lineTotal = (l) => round2(l.qty * l.price);

/** HT per line, VAT per rate on the rate's subtotal, TTC. */
export function totals(doc) {
  const byRate = new Map();
  let ht = 0;
  for (const l of doc.lines) {
    const t = lineTotal(l);
    ht += t;
    byRate.set(l.vat, (byRate.get(l.vat) || 0) + t);
  }
  const vats = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, base]) => ({ rate, base: round2(base), amount: round2(base * rate / 100) }));
  const vat = round2(vats.reduce((s, v) => s + v.amount, 0));
  ht = round2(ht);
  return { ht, vats, vat, ttc: round2(ht + vat) };
}

/** Effective status: an unpaid issued invoice past its due date is late; a sent quote past validity is expired. */
export function statusOf(doc, today = isoDate(new Date())) {
  if (doc.kind === 'facture' && doc.status === 'émise' && doc.due < today) return 'retard';
  if (doc.kind === 'devis' && doc.status === 'envoyé' && doc.validUntil < today) return 'expiré';
  return doc.status;
}

export function nextNumber(state, kind, date) {
  const year = date.slice(0, 4);
  const prefix = kind === 'devis' ? 'D' : 'F';
  const key = `${prefix}${year}`;
  state.seq[key] = (state.seq[key] || 0) + 1;
  return `${prefix}-${year}-${String(state.seq[key]).padStart(4, '0')}`;
}

// ---------- Seed ----------
const CLIENTS = [
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

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

function makeLines(r, vat) {
  const n = 2 + Math.floor(r() * 3);
  const picked = new Set();
  const lines = [];
  while (lines.length < n) {
    const i = Math.floor(r() * CATALOG.length);
    if (picked.has(i)) continue;
    picked.add(i);
    const c = CATALOG[i];
    const qty = c.unit === 'forfait' ? 1 : c.unit === 'h' ? 4 + Math.floor(r() * 30) : c.unit === 'm²' ? 12 + Math.floor(r() * 50) : c.unit === 'ml' ? 2 + Math.floor(r() * 5) : 1 + Math.floor(r() * 4);
    lines.push({ label: c.label, qty, unit: c.unit, price: c.price, vat });
  }
  return lines;
}

const SUBJECTS = { ml: 'Agencement sur mesure', 'm²': 'Parquet et finitions', forfait: 'Réalisation sur mesure' };
function subjectFor(lines) {
  const main = [...lines].sort((a, b) => lineTotal(b) - lineTotal(a))[0];
  const base = main.label.split(',')[0];
  return base.length <= 60 ? base : SUBJECTS[main.unit] || 'Travaux de menuiserie';
}

const VAT_NOTE = 'TVA à 10 % : travaux d’amélioration dans un logement achevé depuis plus de 2 ans (attestation du client).';

export function seed(now = new Date()) {
  const today = isoDate(now);
  const r = rng(20261022);
  const state = { v: 1, clients: [], docs: [], seq: {} };
  state.clients = CLIENTS.map((c, i) => ({
    id: uid('c'), token: uid('', 16), ...c,
    email: `${c.contact.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.com`,
    phone: `06 39 98 ${String(20 + i * 7).padStart(2, '0')} ${String(11 + i * 5).padStart(2, '0')}`,
    siret: c.type === 'pro' ? `${String(800000000 + i * 1234567).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} 000${10 + i}` : '',
    created: addDays(today, -420 + i * 9),
  }));

  // 14 months of accepted quotes turned into invoices, paid with a realistic delay
  const events = [];
  for (let m = 13; m >= 0; m--) {
    const count = 3 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      const quoteDate = addDays(today, -m * 30 - Math.floor(r() * 28) - 20);
      events.push({ quoteDate, client: state.clients[Math.floor(r() * state.clients.length)] });
    }
  }
  events.sort((a, b) => a.quoteDate.localeCompare(b.quoteDate));
  for (const ev of events) {
    const c = ev.client;
    const vat = c.type === 'part' ? 10 : 20;
    const lines = makeLines(r, vat);
    const qDate = ev.quoteDate;
    const accepted = addDays(qDate, 3 + Math.floor(r() * 10));
    const invDate = addDays(accepted, 10 + Math.floor(r() * 20));
    const outcome = r();
    if (outcome >= 0.58 && addDays(qDate, 30) < today) { // refused, or never answered (expired)
      const refused = outcome < 0.8;
      state.docs.push({
        id: uid('d'), kind: 'devis', client: c.id, date: qDate, validUntil: addDays(qDate, 30), status: refused ? 'refusé' : 'envoyé',
        subject: subjectFor(lines), lines, notes: c.type === 'part' ? VAT_NOTE : '', token: uid('', 16), signedBy: '', acceptedAt: '', fingerprint: '', number: '',
        log: [{ at: qDate, text: 'Devis créé' }, { at: addDays(qDate, 1), text: 'Envoyé au client' }, ...(refused ? [{ at: addDays(qDate, 6 + Math.floor(r() * 10)), text: 'Refusé par le client' }] : [])],
      });
      continue;
    }
    if (invDate > today) continue;
    const quote = {
      id: uid('d'), kind: 'devis', client: c.id, date: qDate, validUntil: addDays(qDate, 30), status: 'accepté',
      subject: subjectFor(lines), lines, notes: c.type === 'part' ? VAT_NOTE : '', token: uid('', 16),
      signedBy: c.contact, acceptedAt: `${accepted}T10:${String(10 + Math.floor(r() * 40))}:00`, fingerprint: '',
      log: [{ at: qDate, text: 'Devis créé' }, { at: addDays(qDate, 1), text: 'Envoyé au client' }, { at: accepted, text: `Accepté en ligne par ${c.contact}` }],
    };
    const due = addDays(invDate, 30);
    const payDelay = Math.floor(r() * 50) + 5;
    const paidAt = addDays(invDate, payDelay);
    const old = addDays(invDate, 75) < today; // old invoices are all settled, recent ones may still be open
    const paid = old || (paidAt <= today && r() > 0.3);
    const inv = {
      id: uid('f'), kind: 'facture', client: c.id, date: invDate, due, status: paid ? 'payée' : 'émise', subject: subjectFor(lines), lines: lines.map((l) => ({ ...l })),
      notes: quote.notes, token: uid('', 16), quote: quote.id, paidAt: paid ? paidAt : '', payMethod: paid ? PAY_METHODS[Math.floor(r() * 3)] : '',
      reminders: 0, log: [],
    };
    quote.invoice = inv.id;
    state.docs.push(quote, inv);
  }

  // open pipeline: sent, refused, draft quotes
  const open = [
    [0, -6, 'envoyé'], [5, -12, 'envoyé'], [7, -3, 'envoyé'], [2, -40, 'refusé'], [9, -50, 'envoyé'], [3, -1, 'brouillon'], [1, -18, 'accepté'],
  ];
  for (const [ci, offset, status] of open) {
    const c = state.clients[ci];
    const date = addDays(today, offset);
    const lines = makeLines(r, c.type === 'part' ? 10 : 20);
    const q = {
      id: uid('d'), kind: 'devis', client: c.id, date, validUntil: addDays(date, 30), status, subject: subjectFor(lines),
      number: '', lines, notes: c.type === 'part' ? VAT_NOTE : '', token: uid('', 16),
      signedBy: status === 'accepté' ? c.contact : '', acceptedAt: status === 'accepté' ? `${addDays(date, 4)}T16:42:00` : '', fingerprint: '',
      log: [{ at: date, text: 'Devis créé' }],
    };
    if (status !== 'brouillon') q.log.push({ at: date, text: 'Envoyé au client' });
    if (status === 'refusé') q.log.push({ at: addDays(date, 9), text: 'Refusé par le client' });
    if (status === 'accepté') q.log.push({ at: addDays(date, 4), text: `Accepté en ligne par ${c.contact}` });
    state.docs.push(q);
  }
  // numbers follow the date order, without gaps (required for invoices)
  const byDate = (a, b) => a.date.localeCompare(b.date);
  state.docs.filter((d) => d.kind === 'devis' && d.status !== 'brouillon').sort(byDate).forEach((d) => { d.number = nextNumber(state, 'devis', d.date); });
  state.docs.filter((d) => d.kind === 'facture').sort(byDate).forEach((d) => { d.number = nextNumber(state, 'facture', d.date); });
  for (const inv of state.docs.filter((d) => d.kind === 'facture')) {
    const q = state.docs.find((d) => d.id === inv.quote);
    inv.log = [{ at: inv.date, text: `Facture émise depuis le devis ${q.number}` }, ...(inv.paidAt ? [{ at: inv.paidAt, text: `Paiement reçu (${inv.payMethod.toLowerCase()})` }] : [])];
    q.log.push({ at: inv.date, text: `Converti en facture ${inv.number}` });
  }
  state.docs.forEach((d) => { if (!d.number) d.number = ''; });
  return state;
}

// ---------- Validation (tampered or corrupt data is discarded) ----------
const str = (v, max) => typeof v === 'string' && v.length <= max;
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const validLine = (l) => l && str(l.label, 200) && l.label.length > 0 && num(l.qty, 0.01, 100000) && UNITS.includes(l.unit) && num(l.price, 0, 1e7) && VAT_RATES.includes(l.vat);
export function validClient(c) {
  return c && str(c.id, 20) && str(c.token, 32) && ['pro', 'part'].includes(c.type) && str(c.name, 80) && c.name.length > 1
    && str(c.contact, 80) && str(c.email, 254) && str(c.phone, 20) && str(c.address, 120) && /^\d{5}$/.test(c.zip) && str(c.city, 60) && str(c.siret || '', 20);
}
export function validDoc(d) {
  return d && str(d.id, 20) && ['devis', 'facture'].includes(d.kind) && str(d.client, 20) && day(d.date) && str(d.number || '', 20) && str(d.subject || '', 120)
    && Array.isArray(d.lines) && d.lines.length <= 60 && d.lines.every(validLine) && str(d.notes || '', 600) && str(d.token, 32)
    && (d.kind === 'devis' ? Object.hasOwn(QUOTE_STATUS, d.status) && day(d.validUntil) : ['brouillon', 'émise', 'payée'].includes(d.status) && day(d.due))
    && Array.isArray(d.log) && d.log.length < 200;
}
export function validState(s) {
  return s && s.v === 1 && Array.isArray(s.clients) && s.clients.length < 1000 && s.clients.every(validClient)
    && Array.isArray(s.docs) && s.docs.length < 5000 && s.docs.every(validDoc) && s.seq && typeof s.seq === 'object';
}

export const monthKey = (iso) => iso.slice(0, 7);
export function lastMonths(n, today = isoDate(new Date())) {
  const d = parseDate(today);
  d.setDate(1);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1);
    return isoDate(x).slice(0, 7);
  });
}
