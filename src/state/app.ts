// Business actions on quotes, invoices and clients. Each one checks the role (staff) or the document
// state (client portal) itself, so the interface cannot do more than the rules allow.
import { can, CATALOG, PAYMENT_DAYS, STAFF, VALIDITY_DAYS, type PayMethod, type StaffAccount } from '../domain/catalog';
import { addDays, isoDate, localStamp, nextNumber, proofPayload } from '../domain/rules';
import { clientSchema, lineSchema, stateSchema, type Client, type Doc, type HistoryEntry, type Invoice, type Line, type Quote, type State } from '../domain/schema';
import { seed } from '../domain/seed';
import { randomId, sha256Hex, verifyPassword } from '../shared/security';
import { createPersistedStore } from '../shared/store';

export const STORE_KEY = 'morel:v2';
export const newToken = () => randomId('', 16);
let unsealed = false; // the seed was just generated and its signed quotes have no fingerprint yet
export const app = createPersistedStore<State>(STORE_KEY, stateSchema, () => { unsealed = true; return seed(new Date(), newToken); });
export const useBooks = <T,>(selector: (s: State) => T): T => app.use((x) => selector(x.data));

export type ActionError = 'forbidden' | 'invalid' | 'not-found';
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: ActionError };

const entry = (now: Date, type: HistoryEntry['type'], by: string, ref = '', note = ''): HistoryEntry => ({ at: localStamp(now), type, by, ref, note });
const find = (id: string) => app.get().docs.find((d) => d.id === id);
const edit = (id: string, recipe: (d: Doc, s: State) => void, event?: { type: string; [k: string]: string }) =>
  app.update((s) => { const d = s.docs.find((x) => x.id === id); if (d) recipe(d, s); }, event ? { id, ...event } : undefined);

// ---------- drafts ----------
export function newDraft(kind: Doc['kind'], clientId: string, staff: StaffAccount, now = new Date()): Result<{ id: string }> {
  if (!can(staff.role, 'docs.edit')) return { ok: false, error: 'forbidden' };
  const client = app.get().clients.find((c) => c.id === clientId);
  if (!client) return { ok: false, error: 'not-found' };
  const today = isoDate(now);
  const base = { id: randomId(kind === 'quote' ? 'd' : 'f'), client: client.id, date: today, number: '', subject: '', notes: '',
    lines: [{ ...(CATALOG.find((c) => c.unit === 'h') ?? { label: 'Main-d’œuvre', unit: 'h' as const, price: 5200 }), qty: 8, vat: client.type === 'part' ? 10 as const : 20 as const }],
    history: [entry(now, 'created', staff.name)] };
  const doc: Doc = kind === 'quote'
    ? { ...base, kind: 'quote', status: 'draft', validUntil: addDays(today, VALIDITY_DAYS), signedBy: '', acceptedAt: '', fingerprint: '' }
    : { ...base, kind: 'invoice', status: 'draft', due: addDays(today, PAYMENT_DAYS), paidAt: '', payMethod: '', reminders: 0 };
  app.update((s) => { s.docs.push(doc); }, { type: 'doc.created', id: doc.id });
  return { ok: true, id: doc.id };
}

export interface DraftPatch { client: string; subject: string; notes: string; lines: Line[] }

export function saveDraft(id: string, patch: DraftPatch, staff: StaffAccount): ActionError | null {
  if (!can(staff.role, 'docs.edit')) return 'forbidden';
  const d = find(id);
  if (!d) return 'not-found';
  if (d.status !== 'draft') return 'invalid'; // issued documents are frozen
  if (!app.get().clients.some((c) => c.id === patch.client)) return 'invalid';
  if (!patch.lines.every((l) => lineSchema.safeParse(l).success) || patch.subject.length > 120 || patch.notes.length > 600) return 'invalid';
  edit(id, (x) => { Object.assign(x, { client: patch.client, subject: patch.subject, notes: patch.notes, lines: patch.lines.map((l) => ({ ...l })) }); }, { type: 'doc.saved' });
  return null;
}

export function deleteDraft(id: string, staff: StaffAccount): ActionError | null {
  if (!can(staff.role, 'docs.edit')) return 'forbidden';
  const d = find(id);
  if (!d) return 'not-found';
  if (d.status !== 'draft') return 'invalid'; // an issued invoice is never deleted: a credit note corrects it
  app.update((s) => {
    s.docs = s.docs.filter((x) => x.id !== id);
    for (const q of s.docs) if (q.kind === 'quote' && q.invoice === id) delete q.invoice;
  }, { type: 'doc.deleted', id });
  return null;
}

const ready = (d: Doc) => d.lines.length > 0 && d.subject.trim().length >= 3;

// ---------- quotes ----------
export function sendQuote(id: string, staff: StaffAccount, now = new Date()): ActionError | null {
  if (!can(staff.role, 'docs.send')) return 'forbidden';
  const d = find(id);
  if (!d || d.kind !== 'quote') return 'not-found';
  if (d.status !== 'draft' || !ready(d)) return 'invalid';
  const today = isoDate(now);
  edit(id, (x, s) => {
    if (x.kind !== 'quote') return;
    const next = nextNumber(s.seq, 'quote', today);
    s.seq[next.key] = next.value;
    Object.assign(x, { number: next.number, date: today, validUntil: addDays(today, VALIDITY_DAYS), status: 'sent' });
    x.history.push(entry(now, 'sent', staff.name));
  }, { type: 'quote.sent' });
  return null;
}

/**
 * Acceptance, from the client portal (online: the private link is the credential) or recorded by
 * the owner from a paper copy. The SHA-256 proof commits to the number, lines, total, signer and time.
 */
export async function acceptQuote(id: string, signedBy: string, via: 'online' | 'paper', staff: StaffAccount | null, now = new Date()): Promise<ActionError | null> {
  if (via === 'paper' && !can(staff?.role, 'docs.edit')) return 'forbidden';
  const d = find(id);
  if (!d || d.kind !== 'quote') return 'not-found';
  if (d.status !== 'sent' || d.validUntil < isoDate(now) || !/^[\p{L}][\p{L}\p{M}' .-]{2,79}$/u.test(signedBy)) return 'invalid';
  const at = localStamp(now);
  const fingerprint = await sha256Hex(proofPayload(d, signedBy, at));
  edit(id, (x) => {
    if (x.kind !== 'quote' || x.status !== 'sent') return;
    Object.assign(x, { status: 'accepted', signedBy, acceptedAt: at, fingerprint });
    x.history.push(entry(now, 'accepted', signedBy, via));
  }, { type: 'quote.accepted' });
  return null;
}

export function refuseQuote(id: string, by: string, note: string, staff: StaffAccount | null, now = new Date()): ActionError | null {
  if (staff && !can(staff.role, 'docs.edit')) return 'forbidden';
  const d = find(id);
  if (!d || d.kind !== 'quote') return 'not-found';
  if (d.status !== 'sent') return 'invalid';
  edit(id, (x) => {
    if (x.kind !== 'quote') return;
    x.status = 'refused';
    x.history.push(entry(now, 'refused', by.slice(0, 80), '', note.slice(0, 300)));
  }, { type: 'quote.refused' });
  return null;
}

/** First opening of a pending quote in the portal, written once to its history (a read receipt). */
export function markViewed(id: string, by: string, now = new Date()): void {
  const d = find(id);
  if (!d || d.kind !== 'quote' || d.status !== 'sent' || d.history.some((h) => h.type === 'viewed')) return;
  edit(id, (x) => { x.history.push(entry(now, 'viewed', by.slice(0, 80))); }, { type: 'quote.viewed' });
}

/** Recomputes the proof of an accepted quote: "tampered" means its stored content was changed since. */
/** The seed is built synchronously and SubtleCrypto is not: right after seeding, its signed quotes get their fingerprint. */
export async function sealSeed(): Promise<void> {
  if (!unsealed) return;
  unsealed = false;
  const key = (q: Quote) => `${q.id}|${q.acceptedAt}`;
  const signed = app.get().docs.filter((d): d is Quote => d.kind === 'quote' && d.acceptedAt !== '' && d.fingerprint === '');
  const prints = new Map(await Promise.all(signed.map(async (q) => [key(q), await sha256Hex(proofPayload(q, q.signedBy, q.acceptedAt))] as const)));
  if (!app.get().docs.some((d) => d.kind === 'quote' && d.fingerprint === '' && prints.has(key(d)))) return;
  app.update((s) => { for (const d of s.docs) if (d.kind === 'quote' && d.fingerprint === '') d.fingerprint = prints.get(key(d)) ?? ''; });
}

export async function verifyProof(d: Quote): Promise<'valid' | 'tampered' | 'none'> {
  if (!d.fingerprint || !d.acceptedAt) return 'none';
  return (await sha256Hex(proofPayload(d, d.signedBy, d.acceptedAt))) === d.fingerprint ? 'valid' : 'tampered';
}

export function convertToInvoice(id: string, staff: StaffAccount, now = new Date()): Result<{ id: string }> {
  if (!can(staff.role, 'docs.edit')) return { ok: false, error: 'forbidden' };
  const q = find(id);
  if (!q || q.kind !== 'quote') return { ok: false, error: 'not-found' };
  if (q.invoice) return { ok: true, id: q.invoice };
  if (q.status !== 'accepted') return { ok: false, error: 'invalid' };
  const today = isoDate(now);
  const inv: Invoice = {
    kind: 'invoice', id: randomId('f'), client: q.client, date: today, due: addDays(today, PAYMENT_DAYS), number: '', status: 'draft',
    subject: q.subject, notes: q.notes, lines: q.lines.map((l) => ({ ...l })), quote: q.id, paidAt: '', payMethod: '', reminders: 0,
    history: [entry(now, 'created', staff.name, q.number)],
  };
  app.update((s) => {
    s.docs.push(inv);
    const x = s.docs.find((d) => d.id === q.id);
    if (x?.kind === 'quote') x.invoice = inv.id;
  }, { type: 'doc.created', id: inv.id });
  return { ok: true, id: inv.id };
}

export function duplicate(id: string, staff: StaffAccount, now = new Date()): Result<{ id: string }> {
  const src = find(id);
  if (!src) return { ok: false, error: 'not-found' };
  const created = newDraft('quote', src.client, staff, now);
  if (!created.ok) return created;
  edit(created.id, (d) => {
    Object.assign(d, { lines: src.lines.map((l) => ({ ...l })), subject: src.subject, notes: src.notes });
    d.history.push(entry(now, 'duplicated', staff.name, src.number));
  });
  return created;
}

// ---------- invoices ----------
/** Issuing gives the next number and today's date: numbers stay in date order, with no gaps. */
export function issueInvoice(id: string, staff: StaffAccount, now = new Date()): ActionError | null {
  if (!can(staff.role, 'docs.issue')) return 'forbidden';
  const d = find(id);
  if (!d || d.kind !== 'invoice') return 'not-found';
  if (d.status !== 'draft' || !ready(d)) return 'invalid';
  const today = isoDate(now);
  edit(id, (x, s) => {
    if (x.kind !== 'invoice') return;
    const next = nextNumber(s.seq, 'invoice', today);
    s.seq[next.key] = next.value;
    const quote = x.quote ? s.docs.find((q) => q.id === x.quote) : undefined;
    Object.assign(x, { number: next.number, date: today, due: addDays(today, PAYMENT_DAYS), status: 'issued' });
    x.history.push(entry(now, 'issued', staff.name, quote?.number ?? ''));
    quote?.history.push(entry(now, 'converted', staff.name, next.number));
  }, { type: 'invoice.issued' });
  return null;
}

export function recordPayment(id: string, date: string, method: PayMethod, staff: StaffAccount, now = new Date()): ActionError | null {
  if (!can(staff.role, 'payments')) return 'forbidden';
  const d = find(id);
  if (!d || d.kind !== 'invoice') return 'not-found';
  if (d.status !== 'issued' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < d.date || date > isoDate(now)) return 'invalid';
  edit(id, (x) => {
    if (x.kind !== 'invoice') return;
    Object.assign(x, { status: 'paid', paidAt: date, payMethod: method });
    x.history.push(entry(now, 'paid', staff.name, method));
  }, { type: 'invoice.paid' });
  return null;
}

/** Simulated card payment from the client portal. */
export function payOnline(id: string, by: string, now = new Date()): ActionError | null {
  const d = find(id);
  if (!d || d.kind !== 'invoice') return 'not-found';
  if (d.status !== 'issued') return 'invalid';
  edit(id, (x) => {
    if (x.kind !== 'invoice') return;
    Object.assign(x, { status: 'paid', paidAt: isoDate(now), payMethod: 'card' });
    x.history.push(entry(now, 'paid', by.slice(0, 80), 'online'));
  }, { type: 'invoice.paid' });
  return null;
}

export function remind(id: string, staff: StaffAccount, now = new Date()): ActionError | null {
  if (!can(staff.role, 'reminders')) return 'forbidden';
  const d = find(id);
  if (!d || d.kind !== 'invoice') return 'not-found';
  if (d.status !== 'issued') return 'invalid';
  edit(id, (x) => {
    if (x.kind !== 'invoice') return;
    x.reminders = Math.min(99, x.reminders + 1);
    x.history.push(entry(now, 'reminded', staff.name, String(x.reminders)));
  }, { type: 'invoice.reminded' });
  return null;
}

// ---------- clients ----------
export function saveClient(client: Client, staff: StaffAccount, existingId: string | null): ActionError | null {
  if (!can(staff.role, 'clients.edit')) return 'forbidden';
  if (!clientSchema.safeParse(client).success) return 'invalid';
  if (existingId && !app.get().clients.some((c) => c.id === existingId)) return 'not-found';
  app.update((s) => {
    const i = existingId ? s.clients.findIndex((c) => c.id === existingId) : -1;
    if (i >= 0) s.clients[i] = client;
    else s.clients.push(client);
  }, { type: 'client.saved', id: client.id });
  return null;
}

/** A leaked portal link can be cut off: the client gets a new one, the old one stops working. */
export function rotateToken(clientId: string, staff: StaffAccount): ActionError | null {
  if (!can(staff.role, 'clients.edit')) return 'forbidden';
  if (!app.get().clients.some((c) => c.id === clientId)) return 'not-found';
  app.update((s) => { const c = s.clients.find((x) => x.id === clientId); if (c) c.token = newToken(); }, { type: 'client.saved', id: clientId });
  return null;
}

// ---------- staff login ----------
/** Same answer and similar timing whether the e-mail exists or not (no account enumeration). */
export async function logIn(emailRaw: string, password: string): Promise<StaffAccount | null> {
  const email = emailRaw.trim().toLowerCase();
  const staff = STAFF.find((s) => s.email === email);
  const ok = await verifyPassword(password, staff?.salt ?? '00000000000000000000000000000000', staff?.hash ?? '0'.repeat(64));
  return ok && staff ? staff : null;
}
