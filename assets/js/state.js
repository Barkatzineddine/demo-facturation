// Store, selectors and small UI helpers shared by the views.
import { createStore, h, toast, euro, fmtDay, isoDate, localStamp } from './core.js';
import { STORE_KEY, seed, validState, statusOf, totals, QUOTE_STATUS, INVOICE_STATUS } from './data.js';

export const store = createStore(STORE_KEY, seed, validState, {
  onError: () => toast('Le stockage du navigateur est plein : réinitialisez la démo.', 'err'),
});

export const clientById = (id) => store.get().clients.find((c) => c.id === id);
export const docById = (id) => store.get().docs.find((d) => d.id === id);
export const today = () => isoDate(new Date());
export const shortDate = (iso) => fmtDay(iso.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' });
export const longDate = (iso) => fmtDay(iso.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' });
export const money = (v) => euro.format(v);
export const docTtc = (d) => totals(d).ttc;
export const docHt = (d) => totals(d).ht;
export const docPath = (d) => `#/${d.kind === 'devis' ? 'devis' : 'factures'}/${d.id}`;
export const docLabel = (d) => `${d.kind === 'devis' ? 'Devis' : 'Facture'} ${d.number || '(brouillon)'}`;

// status -> [label, tone, icon]. Tone drives a tinted chip; the icon + label carry the meaning, never the colour alone.
const TONES = {
  brouillon: ['neutral', '✎'], 'envoyé': ['info', '➜'], 'accepté': ['good', '✓'], 'refusé': ['bad', '✕'], 'expiré': ['warn', '⌛'],
  'émise': ['info', '●'], retard: ['bad', '!'], 'payée': ['good', '✓'],
};
export function statusChip(doc) {
  const st = statusOf(doc);
  const label = doc.kind === 'devis' ? QUOTE_STATUS[st] : INVOICE_STATUS[st];
  const [tone, icon] = TONES[st];
  return h('span', { class: ['chip', `tone-${tone}`] }, h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, icon), label);
}

export function pageHead(title, sub, ...actions) {
  return h('header', { class: 'page-head' },
    h('div', null, h('h1', { tabindex: '-1' }, title), sub ? h('p', { class: 'muted' }, sub) : null),
    actions.length ? h('div', { class: 'head-actions' }, actions) : null);
}

export function log(doc, text) {
  doc.log.push({ at: localStamp(), text });
}
