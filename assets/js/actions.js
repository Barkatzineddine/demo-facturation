// Business actions on quotes and invoices, plus the payment and reminder dialogs.
import { h, clean, fieldError, toast, uid, sha256, addDays, localStamp } from './core.js';
import { COMPANY, PAY_METHODS, nextNumber, totals } from './data.js';
import { store, docById, clientById, today, longDate, money, log } from './state.js';
import { downloadPdf } from './docpdf.js';

const update = (id, fn) => store.update((st) => { const d = st.docs.find((x) => x.id === id); if (d) fn(d, st); });

export function newDoc(kind, clientId = store.get().clients[0]?.id) {
  const id = uid(kind === 'devis' ? 'd' : 'f');
  const t = today();
  store.update((st) => st.docs.push({
    id, kind, client: clientId, date: t, number: '', status: 'brouillon', subject: '', token: uid('', 16), notes: '',
    lines: [{ label: 'Main-d’œuvre menuisier', qty: 8, unit: 'h', price: 52, vat: clientById(clientId)?.type === 'part' ? 10 : 20 }],
    log: [{ at: localStamp(), text: kind === 'devis' ? 'Devis créé' : 'Facture créée (brouillon)' }],
    ...(kind === 'devis' ? { validUntil: addDays(t, 30), signedBy: '', acceptedAt: '', fingerprint: '' } : { due: addDays(t, 30), paidAt: '', payMethod: '', reminders: 0 }),
  }));
  return id;
}

export function sendQuote(id) {
  update(id, (d, st) => {
    if (d.status !== 'brouillon') return;
    d.date = today();
    d.validUntil = addDays(d.date, 30);
    d.number = nextNumber(st, 'devis', d.date);
    d.status = 'envoyé';
    log(d, 'Envoyé au client (lien vers le portail)');
  });
  toast('Devis envoyé : le client peut le consulter et le signer depuis son portail.');
}

export async function acceptQuote(id, signedBy, via = 'en ligne') {
  const at = localStamp();
  const d = docById(id);
  // integrity proof of what was accepted: number, client, lines, total, signer and time
  const fingerprint = await sha256(JSON.stringify({ number: d.number, client: d.client, lines: d.lines, ttc: totals(d).ttc, signedBy, at }));
  update(id, (x) => {
    if (x.status !== 'envoyé') return;
    Object.assign(x, { status: 'accepté', signedBy, acceptedAt: at, fingerprint });
    log(x, `Accepté ${via} par ${signedBy}`);
  });
}

export function refuseQuote(id, reason = '') {
  update(id, (d) => { if (d.status === 'envoyé') { d.status = 'refusé'; log(d, `Refusé par le client${reason ? ` : « ${reason} »` : ''}`); } });
}

export function convertToInvoice(id) {
  const q = docById(id);
  if (q.status !== 'accepté' || q.invoice) return q.invoice;
  const inv = uid('f');
  const t = today();
  store.update((st) => {
    st.docs.push({
      id: inv, kind: 'facture', client: q.client, date: t, due: addDays(t, 30), number: '', status: 'brouillon', subject: q.subject,
      token: uid('', 16), notes: q.notes, lines: q.lines.map((l) => ({ ...l })), quote: q.id, paidAt: '', payMethod: '', reminders: 0,
      log: [{ at: localStamp(), text: `Créée depuis le devis ${q.number}` }],
    });
    const x = st.docs.find((d) => d.id === q.id);
    x.invoice = inv;
    log(x, 'Converti en facture (brouillon)');
  });
  toast('Facture créée en brouillon : vérifiez-la puis émettez-la.');
  return inv;
}

export function issueInvoice(id) {
  update(id, (d, st) => {
    if (d.status !== 'brouillon') return;
    d.date = today(); // the invoice date is the issue date: numbers stay chronological
    d.due = addDays(d.date, 30);
    d.number = nextNumber(st, 'facture', d.date);
    d.status = 'émise';
    log(d, `Facture émise (${d.number}), échéance le ${longDate(d.due)}`);
    const q = d.quote && st.docs.find((x) => x.id === d.quote);
    if (q) log(q, `Converti en facture ${d.number}`);
  });
  toast('Facture émise. Elle n’est plus modifiable : en cas d’erreur, on établit un avoir.');
}

export function duplicate(id) {
  const src = docById(id);
  const copy = newDoc('devis', src.client);
  update(copy, (d) => { d.lines = src.lines.map((l) => ({ ...l })); d.subject = src.subject; d.notes = src.notes; log(d, `Dupliqué depuis ${src.number || 'un brouillon'}`); });
  return copy;
}

export function removeDraft(id) {
  store.update((st) => { st.docs = st.docs.filter((d) => !(d.id === id && d.status === 'brouillon')); });
}

export function quoteNumberOf(inv) {
  return inv.quote ? docById(inv.quote)?.number : '';
}

export function pdf(doc) {
  downloadPdf({ ...doc, quoteNumber: doc.kind === 'facture' ? quoteNumberOf(doc) : '' }, clientById(doc.client));
}

function dialog(title, body, onClose) {
  const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-t' }, h('h2', { id: 'dlg-t' }, title), body);
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function paymentDialog(id) {
  const d = docById(id);
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'muted' }, `${d.number} · ${money(totals(d).ttc)} TTC`),
    h('div', { class: 'row2' },
      h('div', { class: 'field' }, h('label', { for: 'pay-date' }, 'Date du paiement'), h('input', { id: 'pay-date', type: 'date', value: today(), min: d.date, max: today(), required: true })),
      h('div', { class: 'field' }, h('label', { for: 'pay-method' }, 'Mode'), h('select', { id: 'pay-method' }, PAY_METHODS.map((m) => h('option', null, m))))),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', value: 'cancel', on: { click: () => dlg.close() } }, 'Annuler'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer le paiement')));
  const dlg = dialog('Enregistrer un paiement', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = form.querySelector('#pay-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < d.date || date > today()) { fieldError(form.querySelector('#pay-date'), `Entre le ${longDate(d.date)} et aujourd’hui.`); return; }
    const method = PAY_METHODS.includes(form.querySelector('#pay-method').value) ? form.querySelector('#pay-method').value : PAY_METHODS[0];
    update(id, (x) => { if (x.status === 'émise') { Object.assign(x, { status: 'payée', paidAt: date, payMethod: method }); log(x, `Paiement reçu (${method.toLowerCase()}) le ${longDate(date)}`); } });
    dlg.close();
    toast('Paiement enregistré.');
  });
}

export function reminderText(d) {
  const c = clientById(d.client);
  const late = Math.max(0, Math.round((new Date(today()) - new Date(d.due)) / 864e5));
  const hello = c.type === 'pro' ? `Bonjour ${c.contact},` : `Bonjour ${c.contact.split(' ')[0]},`;
  return `${hello}

Sauf erreur de notre part, la facture ${d.number} du ${longDate(d.date)}, d’un montant de ${money(totals(d).ttc)} TTC, arrivée à échéance le ${longDate(d.due)}, n’a pas encore été réglée${late ? ` (${late} jours de retard)` : ''}.

Vous pouvez la consulter et la régler depuis votre espace client, ou par virement sur le compte ${COMPANY.iban}.

Si le règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message.

Bien cordialement,
Antoine Morel
${COMPANY.name} · ${COMPANY.phone}`;
}

export function reminderDialog(id) {
  const d = docById(id);
  const area = h('textarea', { id: 'rem-text', rows: '12', maxlength: '2000', value: reminderText(d) });
  const status = h('p', { class: 'muted', 'aria-live': 'polite' }, d.reminders ? `Déjà relancée ${d.reminders} fois.` : 'Première relance.');
  const body = h('div', { class: 'form' },
    h('div', { class: 'field' }, h('label', { for: 'rem-text' }, 'Message de relance (modifiable)'), area),
    status,
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => dlg.close() } }, 'Fermer'),
      h('button', { type: 'button', class: 'btn btn-ghost', on: { click: async () => {
        try { await navigator.clipboard.writeText(clean(area.value, 2000, true)); status.textContent = 'Texte copié : collez-le dans votre messagerie.'; } catch { area.select(); status.textContent = 'Copie bloquée par le navigateur : le texte est sélectionné, copiez-le avec Ctrl+C.'; }
      } } }, 'Copier le texte'),
      h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => {
        update(id, (x) => { x.reminders = (x.reminders || 0) + 1; log(x, `Relance n°${x.reminders} envoyée`); });
        dlg.close();
        toast('Relance enregistrée dans l’historique de la facture.');
      } } }, 'Marquer comme relancée')));
  const dlg = dialog(`Relancer ${d.number}`, body);
}

export function linkToPortal(doc) {
  return `#/portail/${clientById(doc.client).token}`;
}

