// Client portal: what a client sees through their private link. Accept or refuse quotes, download PDFs,
// pay invoices (simulated). The link holds an unguessable 16-character token (about 80 bits).
import { h, mount, clean, fieldError, toast, confirmDialog } from './core.js';
import { totals, statusOf } from './data.js';
import { store, clientById, money, longDate, shortDate, statusChip, log, today } from './state.js';
import { acceptQuote, refuseQuote, pdf } from './actions.js';

export function renderPicker(root) {
  mount(root,
    h('header', { class: 'page-head' }, h('div', null, h('h1', { tabindex: '-1' }, 'Portail client'),
      h('p', { class: 'muted' }, 'Chaque client reçoit un lien privé vers son espace : il y consulte ses devis, les accepte avec une signature horodatée, télécharge ses factures et les règle en ligne.'))),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Voir le portail en tant que…'),
      h('ul', { class: 'rows' }, store.get().clients.map((c) => {
        const waiting = store.get().docs.filter((d) => d.client === c.id && ((d.kind === 'devis' && statusOf(d) === 'envoyé') || (d.kind === 'facture' && d.status === 'émise'))).length;
        return h('li', { class: 'row' },
          h('div', null, h('a', { class: 'row-title', href: `#/portail/${c.token}` }, c.name), h('p', { class: 'muted small' }, `${c.contact} · ${c.city}`)),
          h('div', { class: 'row-end' }, waiting ? h('span', { class: 'chip tone-info' }, h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, '●'), `${waiting} à traiter`) : h('span', { class: 'muted small' }, 'à jour')));
      }))));
}

export function render(root, { token }) {
  const viewed = new Set();

  function draw() {
    const c = store.get().clients.find((x) => x.token === token);
    if (!c) {
      mount(root, h('header', { class: 'page-head' }, h('div', null, h('h1', { tabindex: '-1' }, 'Lien invalide'), h('p', { class: 'muted' }, 'Ce lien d’accès n’existe pas ou a été révoqué.'))));
      return;
    }
    const docs = store.get().docs.filter((d) => d.client === c.id && d.status !== 'brouillon');
    const t = today();
    const quotes = docs.filter((d) => d.kind === 'devis' && statusOf(d, t) === 'envoyé');
    const unpaid = docs.filter((d) => d.kind === 'facture' && d.status === 'émise');
    const archive = docs.filter((d) => !quotes.includes(d) && !unpaid.includes(d)).sort((a, b) => b.date.localeCompare(a.date));

    // first view of a pending quote is written to its history, like a read receipt
    const fresh = quotes.filter((q) => !viewed.has(q.id) && !q.log.some((l) => l.text === 'Consulté par le client'));
    quotes.forEach((q) => viewed.add(q.id));
    if (fresh.length) { store.update((st) => fresh.forEach((q) => log(st.docs.find((x) => x.id === q.id), 'Consulté par le client'))); return; }

    mount(root,
      h('div', { class: 'portal-banner', role: 'note' }, h('strong', null, 'Vue client'), ` · Vous voyez exactement ce que voit ${c.contact} via son lien privé. `, h('a', { href: '#/portail' }, 'Changer de client')),
      h('header', { class: 'portal-head' },
        h('p', { class: 'muted small' }, 'Morel Agencement · Espace client'),
        h('h1', { tabindex: '-1' }, `Bonjour ${c.contact.replace(/^(Dr|M\.|Mme)\s+/, '').split(' ')[0]}`),
        h('p', { class: 'muted' }, quotes.length || unpaid.length ? `${quotes.length} devis à valider · ${unpaid.length} facture${unpaid.length > 1 ? 's' : ''} à régler` : 'Tout est à jour. Merci pour votre confiance !')),
      quotes.map(quoteCard),
      unpaid.length ? h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Factures à régler'),
        h('ul', { class: 'rows' }, unpaid.map((d) => h('li', { class: 'row' },
          h('div', null, h('p', { class: 'row-title' }, `Facture ${d.number}`), h('p', { class: 'muted small' }, `${d.subject} · échéance ${shortDate(d.due)}`)),
          h('div', { class: 'row-end' }, h('strong', { class: 'num' }, money(totals(d).ttc)), statusChip(d),
            h('button', { type: 'button', class: 'btn btn-ghost btn-xs', on: { click: () => pdf(d) } }, 'PDF', h('span', { class: 'sr' }, ` facture ${d.number}`)),
            h('button', { type: 'button', class: 'btn btn-primary btn-xs', on: { click: () => payOnline(d) } }, 'Payer', h('span', { class: 'sr' }, ` facture ${d.number}`))))))) : null,
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Mes documents'),
        archive.length ? h('ul', { class: 'rows' }, archive.map((d) => h('li', { class: 'row' },
          h('div', null, h('p', { class: 'row-title' }, `${d.kind === 'devis' ? 'Devis' : 'Facture'} ${d.number}`), h('p', { class: 'muted small' }, `${d.subject} · ${shortDate(d.date)}`)),
          h('div', { class: 'row-end' }, h('strong', { class: 'num' }, money(totals(d).ttc)), statusChip(d),
            h('button', { type: 'button', class: 'btn btn-ghost btn-xs', on: { click: () => pdf(d) } }, 'PDF', h('span', { class: 'sr' }, ` ${d.number}`)))))) : h('p', { class: 'muted' }, 'Aucun document archivé.')),
      h('p', { class: 'muted small' }, 'Accès sécurisé par lien personnel. En production : lien à durée limitée, envoyé par e-mail, révocable à tout moment.'));
  }

  function quoteCard(d) {
    const t = totals(d);
    const name = h('input', { id: `sig-${d.id}`, maxlength: '80', autocomplete: 'name', required: true });
    const agree = h('input', { id: `ok-${d.id}`, type: 'checkbox', required: true });
    const form = h('form', { class: 'form sign', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: `sig-${d.id}` }, 'Nom et prénom du signataire'), name),
      h('div', { class: 'field check' }, agree, h('label', { for: `ok-${d.id}` }, `Bon pour accord : j’accepte ce devis de ${money(t.ttc)} TTC et ses conditions.`)),
      h('div', { class: 'form-actions' },
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Signer et accepter'),
        h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => pdf(d) } }, 'Télécharger le PDF'),
        h('button', { type: 'button', class: 'btn btn-danger', on: { click: () => refuse(d) } }, 'Refuser')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const who = clean(name.value, 80);
      let ok = fieldError(name, /^[\p{L}][\p{L}\p{M}' .-]{2,79}$/u.test(who) && who.includes(' ') ? '' : 'Indiquez votre prénom et votre nom.');
      ok = fieldError(agree, agree.checked ? '' : 'Cochez la case pour accepter.') && ok;
      if (!ok) return;
      await acceptQuote(d.id, who);
      toast('Devis accepté. Merci ! L’atelier est prévenu et revient vers vous pour planifier les travaux.');
    });
    return h('section', { class: 'card quote-card', 'aria-labelledby': `q-${d.id}` },
      h('div', { class: 'qc-head' },
        h('div', null, h('h2', { id: `q-${d.id}`, class: 'card-title' }, `Devis ${d.number} · ${d.subject}`), h('p', { class: 'muted small' }, `Émis le ${longDate(d.date)} · valable jusqu’au ${longDate(d.validUntil)}`)),
        h('p', { class: 'qc-total' }, h('span', { class: 'muted small' }, 'Total TTC'), h('strong', null, money(t.ttc)))),
      h('ul', { class: 'qc-lines' }, d.lines.map((l) => h('li', null, h('span', null, `${l.label} (${l.qty.toLocaleString('fr-FR')} ${l.unit})`), h('span', { class: 'num' }, money(l.qty * l.price))))),
      h('p', { class: 'muted small' }, `Dont TVA ${money(t.vat)}. Acompte de 30 % à la commande.`),
      form);
  }

  async function refuse(d) {
    const reason = h('textarea', { id: 'refuse-reason', rows: '3', maxlength: '300' });
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'rf-t' },
      h('form', { method: 'dialog', class: 'form' },
        h('h2', { id: 'rf-t' }, 'Refuser ce devis ?'),
        h('div', { class: 'field' }, h('label', { for: 'refuse-reason' }, 'Une précision pour l’atelier ? (facultatif)'), reason),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn btn-ghost', value: 'no' }, 'Annuler'), h('button', { class: 'btn btn-danger', value: 'yes' }, 'Refuser le devis'))));
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'yes') { refuseQuote(d.id, clean(reason.value, 300)); toast('Votre réponse a été transmise.'); }
      dlg.remove();
    });
    document.body.append(dlg);
    dlg.showModal();
  }

  async function payOnline(d) {
    const ok = await confirmDialog({
      title: `Payer ${money(totals(d).ttc)} ?`,
      body: 'Paiement simulé pour la démo : aucune carte n’est demandée ni débitée. En production, redirection vers un prestataire de paiement certifié (3-D Secure).',
      ok: 'Simuler le paiement',
    });
    if (!ok) return;
    store.update((st) => {
      const x = st.docs.find((y) => y.id === d.id);
      if (x && x.status === 'émise') { Object.assign(x, { status: 'payée', paidAt: today(), payMethod: 'Carte bancaire' }); log(x, 'Payée en ligne par le client (simulation)'); }
    });
    toast('Paiement reçu, merci ! La facture est marquée payée.');
  }

  const off = store.subscribe(draw); // subscribed first: the read receipt below re-renders through it
  draw();
  return off;
}
