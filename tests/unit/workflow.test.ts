import { beforeEach, describe, expect, it } from 'vitest';
import { STAFF, type StaffAccount } from '../../src/domain/catalog';
import { isoDate, numberingProblems } from '../../src/domain/rules';
import type { Doc, Quote } from '../../src/domain/schema';
import { seed } from '../../src/domain/seed';
import {
  acceptQuote, app, convertToInvoice, deleteDraft, duplicate, issueInvoice, logIn, markViewed, newDraft, newToken, payOnline, recordPayment, refuseQuote, remind,
  rotateToken, saveClient, saveDraft, sealSeed, sendQuote, verifyProof,
} from '../../src/state/app';
import { attemptLogin, setStaff, useStaff } from '../../src/state/session';

const owner = STAFF.find((s) => s.role === 'owner') as StaffAccount;
const accountant = STAFF.find((s) => s.role === 'accountant') as StaffAccount;
const doc = (id: string) => app.get().docs.find((d) => d.id === id) as Doc;
const now = new Date(2026, 9, 23, 15, 30);
const today = isoDate(now);

beforeEach(() => {
  const fresh = seed(now, newToken);
  app.update((s) => { s.clients = fresh.clients; s.docs = fresh.docs; s.seq = fresh.seq; });
  sessionStorage.clear();
});

function draft(by = owner) {
  const client = app.get().clients[0];
  if (!client) throw new Error('seed');
  const r = newDraft('quote', client.id, by, now);
  if (!r.ok) throw new Error(r.error);
  expect(saveDraft(r.id, { client: client.id, subject: 'Dressing sur mesure', notes: '', lines: [{ label: 'Dressing', qty: 3, unit: 'ml', price: 89000, vat: 20 }] }, by)).toBeNull();
  return r.id;
}

describe('from quote to paid invoice', () => {
  it('runs the whole life cycle, numbering and history included', async () => {
    const id = draft();
    const before = app.get().seq[`D${today.slice(0, 4)}`] ?? 0;
    expect(sendQuote(id, owner, now)).toBeNull();
    const sent = doc(id) as Quote;
    expect(sent.number).toBe(`D-${today.slice(0, 4)}-${String(before + 1).padStart(4, '0')}`);
    expect(sent.validUntil > today).toBe(true);

    markViewed(id, 'Sandrine Lafitte', now);
    markViewed(id, 'Sandrine Lafitte', now); // only the first view is recorded
    expect(doc(id).history.filter((h) => h.type === 'viewed')).toHaveLength(1);

    expect(await acceptQuote(id, 'Sandrine Lafitte', 'online', null, now)).toBeNull();
    const accepted = doc(id) as Quote;
    expect(accepted.status).toBe('accepted');
    expect(accepted.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyProof(accepted)).toBe('valid');

    const conv = convertToInvoice(id, owner, now);
    if (!conv.ok) throw new Error(conv.error);
    expect(convertToInvoice(id, owner, now)).toEqual({ ok: true, id: conv.id }); // idempotent
    expect(issueInvoice(conv.id, owner, now)).toBeNull();
    const inv = doc(conv.id);
    expect(inv.number).toMatch(/^F-\d{4}-\d{4}$/);
    expect(numberingProblems(app.get().docs)).toEqual([]);
    expect(doc(id).history.at(-1)).toMatchObject({ type: 'converted', ref: inv.number });

    expect(recordPayment(conv.id, addDaysStr(today, 1), 'transfer', accountant, now)).toBe('invalid'); // in the future
    expect(recordPayment(conv.id, today, 'transfer', accountant, now)).toBeNull();
    expect(doc(conv.id)).toMatchObject({ status: 'paid', paidAt: today, payMethod: 'transfer' });
  });

  it('freezes issued documents: no edit, no deletion', () => {
    const issued = app.get().docs.find((d) => d.kind === 'invoice' && d.status !== 'draft') as Doc;
    expect(saveDraft(issued.id, { client: issued.client, subject: 'x x x', notes: '', lines: issued.lines }, owner)).toBe('invalid');
    expect(deleteDraft(issued.id, owner)).toBe('invalid');
  });

  it('flags a signed quote whose content was changed afterwards', async () => {
    const id = draft();
    sendQuote(id, owner, now);
    await acceptQuote(id, 'Sandrine Lafitte', 'online', null, now);
    app.update((s) => { const l = s.docs.find((d) => d.id === id)?.lines[0]; if (l) l.price = 1; }); // tampering, bypassing the rules
    expect(await verifyProof(doc(id) as Quote)).toBe('tampered');
  });

  it('seals the signed quotes of a fresh seed once, and only then', async () => {
    app.reset();
    const signed = () => app.get().docs.filter((d): d is Quote => d.kind === 'quote' && d.acceptedAt !== '');
    expect(signed().length).toBeGreaterThan(5);
    expect(signed().every((q) => q.fingerprint === '')).toBe(true);
    await sealSeed();
    expect((await Promise.all(signed().map(verifyProof))).every((r) => r === 'valid')).toBe(true);
    const first = signed()[0] as Quote;
    app.update((s) => { const q = s.docs.find((d) => d.id === first.id); if (q?.kind === 'quote') q.fingerprint = ''; }); // a stripped fingerprint is not resealed
    await sealSeed();
    expect(await verifyProof(doc(first.id) as Quote)).toBe('none');
  });

  it('refuses to accept an expired quote or an invalid signature', async () => {
    const id = draft();
    sendQuote(id, owner, now);
    expect(await acceptQuote(id, 'x', 'online', null, now)).toBe('invalid');
    const later = new Date(now.getTime() + 40 * 864e5);
    expect(await acceptQuote(id, 'Sandrine Lafitte', 'online', null, later)).toBe('invalid');
    expect(refuseQuote(id, 'Sandrine Lafitte', 'Trop cher', null, now)).toBeNull();
    expect(doc(id).history.at(-1)).toMatchObject({ type: 'refused', note: 'Trop cher' });
  });
});

describe('roles', () => {
  it('lets the accountant record payments and remind, not create, send, issue or edit clients', async () => {
    const client = firstClient();
    expect(newDraft('quote', client.id, accountant, now)).toEqual({ ok: false, error: 'forbidden' });
    const id = draft();
    expect(sendQuote(id, accountant, now)).toBe('forbidden');
    expect(await acceptQuote(id, 'Sandrine Lafitte', 'paper', accountant, now)).toBe('forbidden');
    expect(saveClient({ ...client, city: 'Pessac' }, accountant, client.id)).toBe('forbidden');
    expect(rotateToken(client.id, accountant)).toBe('forbidden');
    const open = app.get().docs.find((d) => d.kind === 'invoice' && d.status === 'issued') as Doc;
    expect(remind(open.id, accountant, now)).toBeNull();
    expect(doc(open.id)).toMatchObject({ reminders: 1 });
  });

  it('lets a client pay online from the portal', () => {
    const open = app.get().docs.find((d) => d.kind === 'invoice' && d.status === 'issued') as Doc;
    expect(payOnline(open.id, 'Client', now)).toBeNull();
    expect(doc(open.id)).toMatchObject({ status: 'paid', payMethod: 'card' });
    expect(payOnline(open.id, 'Client', now)).toBe('invalid');
  });

  it('replaces a leaked portal link', () => {
    const client = firstClient();
    expect(rotateToken(client.id, owner)).toBeNull();
    expect(app.get().clients[0]?.token).not.toBe(client.token);
    expect(app.get().clients[0]?.token).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
  });

  it('validates clients before saving them', () => {
    const client = firstClient();
    expect(saveClient({ ...client, zip: '3300' }, owner, client.id)).toBe('invalid');
    expect(saveClient({ ...client, siret: '123' }, owner, client.id)).toBe('invalid');
    expect(saveClient({ ...client, city: 'Pessac' }, owner, client.id)).toBeNull();
  });
});

describe('staff sign-in', () => {
  it('knows the demo accounts and gives nothing away for unknown e-mails', async () => {
    expect((await logIn('antoine@morel-agencement.example', 'morel-gerant'))?.role).toBe('owner');
    expect(await logIn('antoine@morel-agencement.example', 'wrong')).toBeNull();
    expect(await logIn('nobody@example.com', 'morel-gerant')).toBeNull();
  });
  it('locks for 30 seconds after five failures', async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) await attemptLogin('x@example.com', 'nope', t0 + i);
    expect(await attemptLogin('x@example.com', 'nope', t0 + 5_000)).toEqual({ ok: false, reason: 'locked', seconds: 25 });
  });
});

function firstClient() {
  const c = app.get().clients[0];
  if (!c) throw new Error('seed');
  return c;
}

function addDaysStr(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + n));
}

describe('drafts', () => {
  it('creates invoice drafts, refuses broken lines and deletes drafts only', () => {
    const client = firstClient();
    const r = newDraft('invoice', client.id, owner, now);
    if (!r.ok) throw new Error(r.error);
    expect(doc(r.id)).toMatchObject({ kind: 'invoice', status: 'draft', number: '' });
    const bad = { client: client.id, subject: 'Réparation', notes: '', lines: [{ label: '', qty: 1, unit: 'u' as const, price: 100, vat: 20 as const }] };
    expect(saveDraft(r.id, bad, owner)).toBe('invalid');
    expect(saveDraft(r.id, { ...bad, client: 'nobody' }, owner)).toBe('invalid');
    expect(issueInvoice(r.id, owner, now)).toBe('invalid'); // no subject yet
    expect(newDraft('quote', 'nobody', owner, now)).toEqual({ ok: false, error: 'not-found' });
    expect(deleteDraft(r.id, owner)).toBeNull();
    expect(deleteDraft(r.id, owner)).toBe('not-found');
  });

  it('duplicates a document as a new draft quote', () => {
    const src = app.get().docs.find((d) => d.kind === 'invoice' && d.status === 'paid') as Doc;
    const r = duplicate(src.id, owner, now);
    if (!r.ok) throw new Error(r.error);
    expect(doc(r.id)).toMatchObject({ kind: 'quote', status: 'draft', subject: src.subject, lines: src.lines });
    expect(doc(r.id).history.at(-1)).toMatchObject({ type: 'duplicated', ref: src.number });
    expect(duplicate(src.id, accountant, now)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('records a paper signature for the owner only', async () => {
    const id = draft();
    sendQuote(id, owner, now);
    expect(await acceptQuote(id, 'Sandrine Lafitte', 'paper', owner, now)).toBeNull();
    expect(doc(id).history.at(-1)).toMatchObject({ type: 'accepted', ref: 'paper' });
    expect(convertToInvoice(draft(), owner, now)).toEqual({ ok: false, error: 'invalid' }); // a draft cannot be invoiced
  });
});

describe('staff session', () => {
  it('keeps only the staff id in sessionStorage and restores nothing else', async () => {
    expect(await attemptLogin('compta@morel-agencement.example', 'morel-compta')).toEqual({ ok: true });
    expect(useStaff.getState().staff?.role).toBe('accountant');
    expect(JSON.parse(sessionStorage.getItem('morel:session') ?? '{}')).toEqual({ id: 'staff-claire' });
    setStaff(null);
    expect(sessionStorage.getItem('morel:session')).toBeNull();
  });
});
