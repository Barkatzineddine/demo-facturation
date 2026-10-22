// Quotes and invoices: filtered lists, draft editor with live totals, read-only view with actions and history.
import { h, mount, clean, fieldError, toast, confirmDialog, download, csv, euro } from './core.js';
import { UNITS, VAT_RATES, CATALOG, QUOTE_STATUS, INVOICE_STATUS, totals, lineTotal, statusOf, validLine } from './data.js';
import { store, docById, clientById, today, shortDate, longDate, money, docPath, pageHead, statusChip } from './state.js';
import { newDoc, sendQuote, acceptQuote, refuseQuote, convertToInvoice, issueInvoice, duplicate, removeDraft, pdf, paymentDialog, reminderDialog, linkToPortal } from './actions.js';

const KIND = {
  devis: { title: 'Devis', one: 'devis', path: 'devis', statuses: QUOTE_STATUS, newLabel: '+ Nouveau devis' },
  facture: { title: 'Factures', one: 'facture', path: 'factures', statuses: INVOICE_STATUS, newLabel: '+ Nouvelle facture' },
};

// ---------- List ----------
export function renderList(root, { kind }) {
  const K = KIND[kind];
  let filter = '';
  let q = '';

  function rows() {
    const t = today();
    const qq = q.toLowerCase();
    return store.get().docs.filter((d) => d.kind === kind)
      .filter((d) => !filter || statusOf(d, t) === filter)
      .filter((d) => !qq || `${d.number} ${clientById(d.client)?.name} ${d.subject}`.toLowerCase().includes(qq))
      .sort((a, b) => (b.status === 'brouillon') - (a.status === 'brouillon') || b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  }

  function drawList(container) {
    const list = rows();
    const t = today();
    mount(container,
      h('p', { class: 'muted small', 'aria-live': 'polite' }, `${list.length} ${K.one}${list.length > 1 && kind === 'facture' ? 's' : ''}`),
      list.length ? h('ul', { class: 'doc-list' }, list.slice(0, 80).map((d) => {
        const c = clientById(d.client);
        const st = statusOf(d, t);
        const when = d.kind === 'devis'
          ? (st === 'envoyé' ? `valable jusqu’au ${shortDate(d.validUntil)}` : `du ${shortDate(d.date)}`)
          : d.status === 'payée' ? `payée le ${shortDate(d.paidAt)}` : d.status === 'brouillon' ? 'non émise' : `échéance ${shortDate(d.due)}`;
        return h('li', { class: 'doc-row' },
          h('a', { href: docPath(d), class: 'doc-link' },
            h('span', { class: 'doc-num' }, d.number || 'Brouillon'),
            h('span', { class: 'doc-client' }, c?.name || '—', h('span', { class: 'muted small doc-subject' }, d.subject || '')),
            h('span', { class: 'doc-when muted small' }, when),
            h('span', { class: 'doc-amount num' }, money(totals(d).ttc)),
            h('span', { class: 'doc-status' }, statusChip(d))));
      })) : h('div', { class: 'empty card' }, h('p', null, 'Aucun document ne correspond.')));
  }

  function draw() {
    const all = store.get().docs.filter((d) => d.kind === kind);
    const t = today();
    const counts = {};
    all.forEach((d) => { const s = statusOf(d, t); counts[s] = (counts[s] || 0) + 1; });
    const search = h('input', { id: 'doc-q', type: 'search', placeholder: 'Numéro, client, objet…', value: q, maxlength: '40', autocomplete: 'off' });
    const listEl = h('div');
    search.addEventListener('input', () => { q = clean(search.value, 40); drawList(listEl); });
    let summary = null;
    if (kind === 'facture') {
      const open = all.filter((d) => d.status === 'émise');
      const late = open.filter((d) => statusOf(d, t) === 'retard');
      summary = `Reste à encaisser ${money(open.reduce((s, d) => s + totals(d).ttc, 0))} TTC, dont ${money(late.reduce((s, d) => s + totals(d).ttc, 0))} en retard.`;
    } else {
      const pending = all.filter((d) => statusOf(d, t) === 'envoyé');
      summary = `${pending.length} devis en attente de réponse pour ${money(pending.reduce((s, d) => s + totals(d).ht, 0))} HT.`;
    }
    const actions = [h('a', { class: 'btn btn-primary', href: `#/${K.path}/nouveau` }, K.newLabel)];
    if (kind === 'facture') actions.unshift(h('button', { type: 'button', class: 'btn btn-ghost', on: { click: exportJournal } }, 'Journal des ventes (CSV)'));
    mount(root,
      pageHead(K.title, summary, ...actions),
      h('div', { class: 'toolbar' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Filtrer par statut' },
          [['', 'Tous', all.length], ...Object.entries(K.statuses).map(([id, label]) => [id, label, counts[id] || 0])].map(([id, label, n]) =>
            h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(filter === id), on: { click: () => { filter = id; draw(); root.querySelector('.seg-btn[aria-pressed=true]')?.focus(); } } },
              label, h('span', { class: 'seg-n' }, String(n))))),
        h('div', { class: 'field search' }, h('label', { for: 'doc-q', class: 'sr' }, 'Rechercher'), search)),
      listEl);
    drawList(listEl);
  }

  function exportJournal() {
    const inv = store.get().docs.filter((d) => d.kind === 'facture' && d.status !== 'brouillon').sort((a, b) => a.number.localeCompare(b.number));
    const fmt = (n) => n.toFixed(2).replace('.', ',');
    const rowsOut = [['Numéro', 'Date', 'Client', 'Objet', 'Total HT', 'TVA', 'Total TTC', 'Échéance', 'Statut', 'Payée le', 'Mode'],
      ...inv.map((d) => { const t = totals(d); return [d.number, d.date, clientById(d.client)?.name, d.subject, fmt(t.ht), fmt(t.vat), fmt(t.ttc), d.due, INVOICE_STATUS[statusOf(d)], d.paidAt, d.payMethod]; })];
    download(`journal-des-ventes-${today()}.csv`, csv(rowsOut), 'text/csv;charset=utf-8');
    toast(`${inv.length} factures exportées.`);
  }

  draw();
  return store.subscribe(draw);
}

// ---------- Single document ----------
export function renderDoc(root, { kind, id }) {
  if (id === 'nouveau') {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const created = newDoc(kind, clientById(params.get('client')) ? params.get('client') : undefined);
    history.replaceState(null, '', `#/${KIND[kind].path}/${created}`);
    id = created;
  }
  let draft = null; // working copy while editing a draft
  let dirty = false;
  let autosave = null;

  function draw() {
    const d = docById(id);
    if (!d || d.kind !== kind) {
      mount(root, pageHead('Document introuvable', 'Il a peut-être été supprimé.', h('a', { class: 'btn btn-ghost', href: `#/${KIND[kind].path}` }, 'Retour à la liste')));
      return;
    }
    if (d.status === 'brouillon') { if (!draft || draft.id !== d.id) draft = structuredClone(d); editor(d); } else { draft = null; view(d); }
  }

  // ----- read-only view -----
  function view(d) {
    const c = clientById(d.client);
    const t = totals(d);
    const st = statusOf(d);
    const acts = [h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => pdf(d) } }, 'Télécharger le PDF')];
    if (kind === 'devis') {
      if (st === 'envoyé') {
        acts.push(h('a', { class: 'btn btn-ghost', href: linkToPortal(d) }, 'Voir côté client'),
          h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => signOnPaper(d) } }, 'Signé sur papier'),
          h('button', { type: 'button', class: 'btn btn-danger', on: { click: async () => { if (await confirmDialog({ title: 'Marquer ce devis comme refusé ?', ok: 'Refusé', danger: true })) { refuseQuote(d.id); toast('Devis marqué comme refusé.'); } } } }, 'Refusé'));
      }
      if (d.status === 'accepté' && !d.invoice) acts.push(h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => { location.hash = `#/factures/${convertToInvoice(d.id)}`; } } }, 'Convertir en facture'));
      if (d.invoice) acts.push(h('a', { class: 'btn btn-ghost', href: `#/factures/${d.invoice}` }, 'Voir la facture'));
      acts.push(h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => { location.hash = `#/devis/${duplicate(d.id)}`; } } }, 'Dupliquer'));
    } else if (d.status === 'émise') {
      acts.push(h('a', { class: 'btn btn-ghost', href: linkToPortal(d) }, 'Voir côté client'));
      if (st === 'retard') acts.push(h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => reminderDialog(d.id) } }, 'Relancer'));
      acts.push(h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => paymentDialog(d.id) } }, 'Enregistrer un paiement'));
    }
    const dates = kind === 'devis'
      ? [['Date', longDate(d.date)], ['Valable jusqu’au', longDate(d.validUntil)], d.acceptedAt ? ['Accepté le', `${longDate(d.acceptedAt)} par ${d.signedBy}`] : null]
      : [['Émise le', longDate(d.date)], ['Échéance', longDate(d.due)], d.paidAt ? ['Payée le', `${longDate(d.paidAt)} (${d.payMethod.toLowerCase()})`] : null,
        d.quote ? ['Devis d’origine', h('a', { href: `#/devis/${d.quote}` }, docById(d.quote)?.number || '—')] : null];
    mount(root,
      h('a', { class: 'back', href: `#/${KIND[kind].path}` }, `← ${KIND[kind].title}`),
      pageHead(`${kind === 'devis' ? 'Devis' : 'Facture'} ${d.number}`, d.subject, statusChip(d)),
      h('div', { class: 'actions-bar' }, acts),
      h('div', { class: 'doc-grid' },
        h('div', { class: 'stack' },
          h('section', { class: 'card' },
            h('dl', { class: 'facts' },
              h('div', null, h('dt', null, 'Client'), h('dd', null, h('a', { href: `#/clients/${c.id}` }, c.name), h('br'), h('span', { class: 'muted small' }, `${c.address}, ${c.zip} ${c.city}`))),
              dates.filter(Boolean).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))))),
          h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Détail'), linesTable(d.lines), totalsBox(t), d.notes ? h('p', { class: 'muted small notes' }, d.notes) : null),
          d.fingerprint ? h('section', { class: 'card proof' }, h('h2', { class: 'card-title' }, 'Preuve d’acceptation'),
            h('p', { class: 'small' }, `Accepté en ligne le ${longDate(d.acceptedAt)} à ${d.acceptedAt.slice(11, 16)} par ${d.signedBy}.`),
            h('p', { class: 'small muted' }, 'Empreinte SHA-256 du devis signé (numéro, lignes, total, signataire, horodatage) :'),
            h('code', { class: 'hash' }, d.fingerprint)) : null),
        historyCard(d)));
  }

  async function signOnPaper(d) {
    const name = clientById(d.client).contact;
    if (await confirmDialog({ title: 'Devis signé sur papier ?', body: `Le devis sera marqué accepté au nom de ${name}. Conservez l’exemplaire signé.`, ok: 'Marquer accepté' })) {
      await acceptQuote(d.id, name, 'sur papier, saisi');
      toast('Devis accepté : vous pouvez le convertir en facture.');
    }
  }

  function linesTable(lines) {
    return h('div', { class: 'table-scroll' }, h('table', { class: 'table lines' },
      h('thead', null, h('tr', null, ['Désignation', 'Qté', 'PU HT', 'TVA', 'Total HT'].map((x, i) => h('th', { scope: 'col', class: i ? 'num' : null }, x)))),
      h('tbody', null, lines.map((l) => h('tr', null,
        h('td', null, l.label),
        h('td', { class: 'num' }, `${l.qty.toLocaleString('fr-FR')} ${l.unit}`),
        h('td', { class: 'num' }, money(l.price)),
        h('td', { class: 'num' }, `${String(l.vat).replace('.', ',')} %`),
        h('td', { class: 'num strong' }, money(lineTotal(l))))))));
  }

  function totalsBox(t) {
    return h('dl', { class: 'totals' },
      h('div', null, h('dt', null, 'Total HT'), h('dd', { class: 'num' }, money(t.ht))),
      t.vats.map((v) => h('div', null, h('dt', null, `TVA ${String(v.rate).replace('.', ',')} %`), h('dd', { class: 'num' }, money(v.amount)))),
      h('div', { class: 'grand' }, h('dt', null, 'Total TTC'), h('dd', { class: 'num' }, money(t.ttc))));
  }

  function historyCard(d) {
    return h('aside', { class: 'card history', 'aria-labelledby': 'hist-t' },
      h('h2', { id: 'hist-t', class: 'card-title' }, 'Historique'),
      h('ol', { class: 'timeline' }, [...d.log].reverse().map((l) => h('li', null, h('span', { class: 'muted small' }, `${shortDate(l.at)}${l.at.length > 10 ? ` · ${l.at.slice(11, 16)}` : ''}`), h('span', null, l.text)))));
  }

  // ----- draft editor -----
  function editor(d) {
    const st = store.get();
    const markDirty = () => { dirty = true; saveState.textContent = 'Modifications non enregistrées'; refreshTotals(); };
    const saveState = h('span', { class: 'muted small', 'aria-live': 'polite' }, dirty ? 'Modifications non enregistrées' : 'Brouillon enregistré');
    const totalsEl = h('div');
    const refreshTotals = () => mount(totalsEl, totalsBox(totals({ lines: draft.lines.filter(validLine) })));

    const clientSel = h('select', { id: 'e-client' }, st.clients.map((c) => h('option', { value: c.id, selected: c.id === draft.client }, `${c.name}${c.type === 'part' ? ' (particulier)' : ''}`)));
    clientSel.addEventListener('change', () => { draft.client = clientSel.value; markDirty(); });
    const subject = h('input', { id: 'e-subject', maxlength: '120', value: draft.subject || '', placeholder: 'Ex. : Dressing sur mesure, chambre parentale' });
    subject.addEventListener('input', () => { draft.subject = subject.value; markDirty(); });
    const notes = h('textarea', { id: 'e-notes', rows: '3', maxlength: '600', value: draft.notes || '', placeholder: 'Conditions particulières, mentions TVA…' });
    notes.addEventListener('input', () => { draft.notes = notes.value; markDirty(); });

    const linesEl = h('div', { class: 'line-editor' });
    function drawLines() {
      mount(linesEl, draft.lines.map((l, i) => {
        const num = (key, attrs) => {
          const input = h('input', { type: 'number', inputmode: 'decimal', value: String(l[key]), 'aria-label': `${attrs.label}, ligne ${i + 1}`, min: attrs.min, step: attrs.step, class: 'num' });
          input.addEventListener('input', () => { l[key] = Number(input.value); total.textContent = Number.isFinite(lineTotal(l)) ? money(lineTotal(l)) : '—'; markDirty(); });
          return input;
        };
        const label = h('textarea', { rows: '1', maxlength: '200', value: l.label, 'aria-label': `Désignation, ligne ${i + 1}` });
        label.addEventListener('input', () => { l.label = label.value; markDirty(); });
        const unit = h('select', { 'aria-label': `Unité, ligne ${i + 1}` }, UNITS.map((u) => h('option', { selected: u === l.unit }, u)));
        unit.addEventListener('change', () => { l.unit = unit.value; markDirty(); });
        const vat = h('select', { 'aria-label': `TVA, ligne ${i + 1}` }, VAT_RATES.map((v) => h('option', { value: String(v), selected: v === l.vat }, `${String(v).replace('.', ',')} %`)));
        vat.addEventListener('change', () => { l.vat = Number(vat.value); markDirty(); });
        const total = h('span', { class: 'le-total num' }, money(lineTotal(l)));
        const move = (dir) => { const j = i + dir; if (j < 0 || j >= draft.lines.length) return; [draft.lines[i], draft.lines[j]] = [draft.lines[j], draft.lines[i]]; markDirty(); drawLines(); };
        return h('div', { class: 'le-row' },
          h('span', { class: 'le-n muted', 'aria-hidden': 'true' }, String(i + 1)),
          label,
          h('div', { class: 'le-nums' }, num('qty', { label: 'Quantité', min: '0', step: '0.01' }), unit, num('price', { label: 'Prix unitaire HT', min: '0', step: '0.01' }), vat, total),
          h('div', { class: 'le-tools' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Monter la ligne ${i + 1}`, disabled: i === 0, on: { click: () => move(-1) } }, '↑'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Descendre la ligne ${i + 1}`, disabled: i === draft.lines.length - 1, on: { click: () => move(1) } }, '↓'),
            h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': `Supprimer la ligne ${i + 1}`, on: { click: () => { draft.lines.splice(i, 1); markDirty(); drawLines(); } } }, '✕')));
      }));
    }
    const defaultVat = () => (clientById(draft.client)?.type === 'part' ? 10 : 20);
    const catalog = h('select', { id: 'e-cat', 'aria-label': 'Ajouter une prestation du catalogue' },
      h('option', { value: '' }, 'Ajouter depuis le catalogue…'),
      CATALOG.map((c, i) => h('option', { value: String(i) }, `${c.label} · ${euro.format(c.price)} / ${c.unit}`)));
    catalog.addEventListener('change', () => {
      const c = CATALOG[Number(catalog.value)];
      if (!c) return;
      draft.lines.push({ label: c.label, qty: 1, unit: c.unit, price: c.price, vat: defaultVat() });
      catalog.value = '';
      markDirty(); drawLines();
    });

    function save(silent) {
      const lines = draft.lines.map((l) => ({ ...l, label: clean(l.label, 200), qty: Math.round(l.qty * 100) / 100, price: Math.round(l.price * 100) / 100 }));
      const bad = lines.findIndex((l) => !validLine(l));
      if (!lines.length) { toast('Ajoutez au moins une ligne.', 'err'); return false; }
      if (bad >= 0) { toast(`Ligne ${bad + 1} incomplète : désignation, quantité positive et prix requis.`, 'err'); linesEl.querySelectorAll('.le-row')[bad]?.querySelector('textarea')?.focus(); return false; }
      const subj = clean(draft.subject, 120);
      if (subj.length < 3) { fieldError(subject, 'Indiquez l’objet du document.'); subject.focus(); return false; }
      fieldError(subject, '');
      dirty = false;
      store.update((s) => {
        const x = s.docs.find((y) => y.id === d.id);
        if (!x || x.status !== 'brouillon') return;
        Object.assign(x, { client: draft.client, subject: subj, notes: clean(draft.notes, 600, true), lines });
      });
      draft = structuredClone(docById(d.id));
      if (!silent) toast('Brouillon enregistré.');
      return true;
    }

    const isQuote = kind === 'devis';
    const primary = h('button', { type: 'button', class: 'btn btn-primary', on: { click: async () => {
      if (!save(true)) return;
      const total = money(totals(docById(d.id)).ttc);
      if (isQuote) {
        if (await confirmDialog({ title: 'Envoyer ce devis ?', body: `Il reçoit un numéro définitif et devient consultable par le client sur son portail (${total} TTC).`, ok: 'Envoyer' })) sendQuote(d.id);
      } else if (await confirmDialog({ title: 'Émettre cette facture ?', body: `Elle reçoit le prochain numéro de facture, la date du jour et une échéance à 30 jours (${total} TTC). Une facture émise ne peut plus être modifiée ni supprimée.`, ok: 'Émettre' })) issueInvoice(d.id);
    } } }, isQuote ? 'Envoyer au client' : 'Émettre la facture');

    mount(root,
      h('a', { class: 'back', href: `#/${KIND[kind].path}` }, `← ${KIND[kind].title}`),
      pageHead(isQuote ? 'Nouveau devis' : 'Nouvelle facture', null, statusChip(d)),
      h('div', { class: 'actions-bar' },
        h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => save(false) } }, 'Enregistrer'),
        primary,
        h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => { if (save(true)) pdf(docById(d.id)); } } }, 'Aperçu PDF'),
        h('button', { type: 'button', class: 'btn btn-danger', on: { click: async () => {
          if (await confirmDialog({ title: 'Supprimer ce brouillon ?', ok: 'Supprimer', danger: true })) { removeDraft(d.id); location.hash = `#/${KIND[kind].path}`; toast('Brouillon supprimé.'); }
        } } }, 'Supprimer'),
        saveState),
      h('div', { class: 'doc-grid' },
        h('div', { class: 'stack' },
          h('section', { class: 'card form' },
            h('div', { class: 'row2' },
              h('div', { class: 'field' }, h('label', { for: 'e-client' }, 'Client'), clientSel, h('a', { class: 'small', href: '#/clients?nouveau=1' }, '+ Nouveau client')),
              h('div', { class: 'field' }, h('label', { for: 'e-subject' }, 'Objet'), subject))),
          h('section', { class: 'card' },
            h('h2', { class: 'card-title' }, 'Lignes'),
            h('div', { class: 'le-head muted small', 'aria-hidden': 'true' }, h('span', null, 'Désignation'), h('span', null, 'Qté · unité · PU HT · TVA · total')),
            linesEl,
            h('div', { class: 'le-add' },
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', on: { click: () => { draft.lines.push({ label: '', qty: 1, unit: 'u', price: 0, vat: defaultVat() }); markDirty(); drawLines(); linesEl.querySelector('.le-row:last-child textarea')?.focus(); } } }, '+ Ligne libre'),
              catalog),
            totalsEl),
          h('section', { class: 'card form' }, h('div', { class: 'field' }, h('label', { for: 'e-notes' }, 'Notes et conditions'), notes),
            h('p', { class: 'muted small' }, isQuote ? 'Le devis sera valable 30 jours à compter de son envoi.' : 'Date et numéro attribués à l’émission, échéance à 30 jours. Pénalités et indemnité de recouvrement ajoutées au PDF.'))),
        historyCard(d)));
    autosave = () => save(true);
    drawLines();
    refreshTotals();
  }

  window.addEventListener('beforeunload', guardLeave);
  function guardLeave(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
  draw();
  const off = store.subscribe(() => { if (!dirty) { draft = null; draw(); } });
  return () => {
    off();
    window.removeEventListener('beforeunload', guardLeave);
    if (dirty) autosave?.(); // leaving the editor keeps the work
  };
}
