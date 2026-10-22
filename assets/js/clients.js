// Clients: searchable list, create/edit dialog with validation, detail page with figures and documents.
import { h, mount, clean, valid, normPhone, fieldError, toast, uid } from './core.js';
import { totals, statusOf, validClient } from './data.js';
import { store, clientById, money, shortDate, docPath, pageHead, statusChip, today } from './state.js';

function figures(clientId) {
  const docs = store.get().docs.filter((d) => d.client === clientId);
  const paid = docs.filter((d) => d.kind === 'facture' && d.status === 'payée');
  const open = docs.filter((d) => d.kind === 'facture' && d.status === 'émise');
  const quotes = docs.filter((d) => d.kind === 'devis' && d.status !== 'brouillon');
  const decided = quotes.filter((d) => ['accepté', 'refusé', 'expiré'].includes(statusOf(d)));
  return {
    docs,
    cashed: paid.reduce((s, d) => s + totals(d).ht, 0),
    open: open.reduce((s, d) => s + totals(d).ttc, 0),
    late: open.filter((d) => statusOf(d) === 'retard').length,
    rate: decided.length ? Math.round((decided.filter((d) => d.status === 'accepté').length / decided.length) * 100) : null,
  };
}

export function clientDialog(existing) {
  const c = existing || { type: 'pro', name: '', contact: '', email: '', phone: '', address: '', zip: '', city: '', siret: '' };
  const input = (id, label, value, attrs = {}) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, value: value || '', ...attrs }));
  const form = h('form', { class: 'form', novalidate: true },
    h('fieldset', { class: 'seg-field' }, h('legend', null, 'Type de client'),
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'type', value: 'pro', checked: c.type === 'pro' }), 'Professionnel (TVA 20 %)'),
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'type', value: 'part', checked: c.type === 'part' }), 'Particulier (TVA 10 % rénovation)')),
    h('div', { class: 'row2' },
      input('cl-name', 'Nom ou raison sociale', c.name, { maxlength: '80', required: true, autocomplete: 'organization' }),
      input('cl-contact', 'Contact', c.contact, { maxlength: '80', required: true, autocomplete: 'name' })),
    h('div', { class: 'row2' },
      input('cl-email', 'E-mail', c.email, { type: 'email', maxlength: '254', required: true, autocomplete: 'email' }),
      input('cl-phone', 'Téléphone', c.phone, { type: 'tel', maxlength: '20', required: true, autocomplete: 'tel' })),
    input('cl-address', 'Adresse', c.address, { maxlength: '120', required: true, autocomplete: 'street-address' }),
    h('div', { class: 'row2' },
      input('cl-zip', 'Code postal', c.zip, { maxlength: '5', inputmode: 'numeric', required: true, autocomplete: 'postal-code' }),
      input('cl-city', 'Ville', c.city, { maxlength: '60', required: true, autocomplete: 'address-level2' })),
    input('cl-siret', 'SIRET (professionnels, facultatif)', c.siret, { maxlength: '20', inputmode: 'numeric' }),
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => dlg.close() } }, 'Annuler'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, existing ? 'Enregistrer' : 'Créer le client')));
  const dlg = h('dialog', { class: 'dialog dialog-wide', 'aria-labelledby': 'cl-t' }, h('h2', { id: 'cl-t' }, existing ? `Modifier ${existing.name}` : 'Nouveau client'), form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(null));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = (id) => form.querySelector(`#${id}`);
      const next = {
        ...c, type: form.querySelector('input[name=type]:checked').value,
        name: clean(v('cl-name').value, 80), contact: clean(v('cl-contact').value, 80), email: clean(v('cl-email').value, 254).toLowerCase(),
        phone: clean(v('cl-phone').value, 20), address: clean(v('cl-address').value, 120), zip: clean(v('cl-zip').value, 5), city: clean(v('cl-city').value, 60),
        siret: clean(v('cl-siret').value, 20).replace(/\s/g, ''),
      };
      let ok = fieldError(v('cl-name'), next.name.length >= 2 ? '' : 'Nom requis.');
      ok = fieldError(v('cl-contact'), valid.name(next.contact.replace(/^(Dr|M\.|Mme)\s+/, '')) ? '' : 'Nom du contact requis.') && ok;
      ok = fieldError(v('cl-email'), valid.email(next.email) ? '' : 'E-mail invalide.') && ok;
      ok = fieldError(v('cl-phone'), valid.phone(next.phone) ? '' : 'Téléphone français attendu.') && ok;
      ok = fieldError(v('cl-address'), next.address.length >= 5 ? '' : 'Adresse requise.') && ok;
      ok = fieldError(v('cl-zip'), /^\d{5}$/.test(next.zip) ? '' : '5 chiffres.') && ok;
      ok = fieldError(v('cl-city'), next.city.length >= 2 ? '' : 'Ville requise.') && ok;
      ok = fieldError(v('cl-siret'), !next.siret || /^\d{14}$/.test(next.siret) ? '' : '14 chiffres.') && ok;
      if (!ok) { form.querySelector('[aria-invalid=true]')?.focus(); return; }
      next.phone = normPhone(next.phone);
      if (next.siret) next.siret = next.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
      if (!existing) Object.assign(next, { id: uid('c'), token: uid('', 16), created: today() });
      if (!validClient(next)) { toast('Données invalides.', 'err'); return; }
      store.update((st) => {
        if (existing) st.clients[st.clients.findIndex((x) => x.id === existing.id)] = next;
        else st.clients.push(next);
      });
      toast(existing ? 'Client mis à jour.' : `${next.name} ajouté.`);
      resolve(next);
      dlg.close();
    });
  });
}

export function renderList(root) {
  let q = '';
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  function draw() {
    const search = h('input', { id: 'cl-q', type: 'search', placeholder: 'Nom, ville, contact…', value: q, maxlength: '40', autocomplete: 'off' });
    const listEl = h('div');
    const drawList = () => {
      const qq = q.toLowerCase();
      const list = store.get().clients.filter((c) => !qq || `${c.name} ${c.city} ${c.contact}`.toLowerCase().includes(qq)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      mount(listEl, h('ul', { class: 'client-grid' }, list.map((c) => {
        const f = figures(c.id);
        return h('li', { class: 'card client-card' },
          h('div', { class: 'cc-head' },
            h('span', { class: 'avatar', 'aria-hidden': 'true' }, c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()),
            h('div', null, h('h2', { class: 'client-name' }, h('a', { href: `#/clients/${c.id}`, class: 'stretched' }, c.name)), h('p', { class: 'muted small' }, `${c.type === 'pro' ? 'Professionnel' : 'Particulier'} · ${c.city}`))),
          h('dl', { class: 'mini-facts' },
            h('div', null, h('dt', null, 'Encaissé HT'), h('dd', { class: 'num' }, money(f.cashed))),
            h('div', null, h('dt', null, 'À encaisser'), h('dd', { class: 'num' }, money(f.open), f.late ? h('span', { class: 'chip tone-bad chip-xs' }, h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, '!'), `${f.late} en retard`) : null))));
      })), list.length ? null : h('p', { class: 'muted' }, 'Aucun client trouvé.'));
    };
    search.addEventListener('input', () => { q = clean(search.value, 40); drawList(); });
    mount(root,
      pageHead('Clients', `${store.get().clients.length} clients`, h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => clientDialog() } }, '+ Nouveau client')),
      h('div', { class: 'toolbar' }, h('div', { class: 'field search' }, h('label', { for: 'cl-q', class: 'sr' }, 'Rechercher un client'), search)),
      listEl);
    drawList();
  }
  draw();
  if (params.get('nouveau')) {
    history.replaceState(null, '', '#/clients');
    clientDialog();
  }
  return store.subscribe(draw);
}

export function renderOne(root, { id }) {
  function draw() {
    const c = clientById(id);
    if (!c) { mount(root, pageHead('Client introuvable', null, h('a', { class: 'btn btn-ghost', href: '#/clients' }, 'Retour'))); return; }
    const f = figures(c.id);
    const docs = [...f.docs].sort((a, b) => b.date.localeCompare(a.date));
    mount(root,
      h('a', { class: 'back', href: '#/clients' }, '← Clients'),
      pageHead(c.name, `${c.type === 'pro' ? 'Professionnel' : 'Particulier'} · client depuis ${shortDate(c.created || today())}`,
        h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => clientDialog(c) } }, 'Modifier'),
        h('a', { class: 'btn btn-ghost', href: `#/portail/${c.token}` }, 'Voir son portail'),
        h('a', { class: 'btn btn-primary', href: `#/devis/nouveau?client=${c.id}` }, '+ Devis')),
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('p', { class: 'kpi-label' }, 'Encaissé HT'), h('p', { class: 'kpi-value' }, money(f.cashed)), h('p', { class: 'kpi-sub' }, 'depuis le début')),
        h('div', { class: 'kpi' }, h('p', { class: 'kpi-label' }, 'À encaisser TTC'), h('p', { class: 'kpi-value' }, money(f.open)), h('p', { class: 'kpi-sub' }, f.late ? `${f.late} facture(s) en retard` : 'aucun retard')),
        h('div', { class: 'kpi' }, h('p', { class: 'kpi-label' }, 'Devis acceptés'), h('p', { class: 'kpi-value' }, f.rate == null ? '—' : `${f.rate} %`), h('p', { class: 'kpi-sub' }, 'des devis tranchés'))),
      h('div', { class: 'doc-grid' },
        h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Documents'),
          docs.length ? h('ul', { class: 'rows' }, docs.map((d) => h('li', { class: 'row' },
            h('div', null, h('a', { href: docPath(d), class: 'row-title' }, `${d.kind === 'devis' ? 'Devis' : 'Facture'} ${d.number || '(brouillon)'}`), h('p', { class: 'muted small' }, `${d.subject || ''} · ${shortDate(d.date)}`)),
            h('div', { class: 'row-end' }, h('strong', { class: 'num' }, money(totals(d).ttc)), statusChip(d))))) : h('p', { class: 'muted' }, 'Aucun document.')),
        h('aside', { class: 'card' }, h('h2', { class: 'card-title' }, 'Coordonnées'),
          h('dl', { class: 'facts' },
            h('div', null, h('dt', null, 'Contact'), h('dd', null, c.contact)),
            h('div', null, h('dt', null, 'E-mail'), h('dd', null, h('a', { href: `mailto:${c.email}` }, c.email))),
            h('div', null, h('dt', null, 'Téléphone'), h('dd', null, h('a', { href: `tel:${c.phone.replace(/\s/g, '')}` }, c.phone))),
            h('div', null, h('dt', null, 'Adresse'), h('dd', null, `${c.address}, ${c.zip} ${c.city}`)),
            c.siret ? h('div', null, h('dt', null, 'SIRET'), h('dd', null, c.siret)) : null))));
  }
  draw();
  return store.subscribe(draw);
}
