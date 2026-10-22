// Dashboard: one period filter scoping every figure below it, KPI tiles, two charts and to-do lists.
import { h, mount, euro0 } from './core.js';
import { totals, statusOf, lastMonths, monthKey } from './data.js';
import { store, clientById, today, shortDate, money, docPath, pageHead, statusChip } from './state.js';
import { columnChart, barList } from './charts.js';
import { reminderDialog } from './actions.js';

const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const MONTH_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const monthDate = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);

export function render(root) {
  const year = Number(today().slice(0, 4));
  const PERIODS = [['12m', '12 derniers mois'], [String(year), `Année ${year}`], [String(year - 1), `Année ${year - 1}`]];
  let period = '12m';

  function months() {
    if (period === '12m') return lastMonths(12);
    return Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
  }

  function draw() {
    const st = store.get();
    const t = today();
    const keys = months();
    const inPeriod = (iso) => iso && keys.includes(monthKey(iso));
    const invoices = st.docs.filter((d) => d.kind === 'facture' && d.status !== 'brouillon');
    const paid = invoices.filter((d) => d.status === 'payée' && inPeriod(d.paidAt));
    const cashed = paid.reduce((s, d) => s + totals(d).ht, 0);
    const billed = invoices.filter((d) => inPeriod(d.date)).reduce((s, d) => s + totals(d).ht, 0);
    const open = invoices.filter((d) => d.status === 'émise');
    const late = open.filter((d) => statusOf(d, t) === 'retard');
    const openSum = open.reduce((s, d) => s + totals(d).ttc, 0);
    const lateSum = late.reduce((s, d) => s + totals(d).ttc, 0);
    const quotes = st.docs.filter((d) => d.kind === 'devis' && d.status !== 'brouillon' && inPeriod(d.date));
    const decided = quotes.filter((d) => ['accepté', 'refusé', 'expiré'].includes(statusOf(d, t)));
    const won = decided.filter((d) => d.status === 'accepté');
    const rate = decided.length ? Math.round((won.length / decided.length) * 100) : 0;

    const points = keys.map((k) => {
      const list = paid.filter((d) => monthKey(d.paidAt) === k);
      const label = MONTH.format(monthDate(k)).replace('.', '');
      return { label, long: MONTH_LONG.format(monthDate(k)), value: list.reduce((s, d) => s + totals(d).ht, 0), count: list.length, sub: `${list.length} facture${list.length > 1 ? 's' : ''} encaissée${list.length > 1 ? 's' : ''}` };
    });
    const byClient = new Map();
    for (const d of paid) byClient.set(d.client, (byClient.get(d.client) || 0) + totals(d).ht);
    const top = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, value]) => ({ label: clientById(id)?.name || '—', value, href: `#/clients/${id}` }));

    const filter = h('div', { class: 'seg', role: 'group', 'aria-label': 'Période' }, PERIODS.map(([id, label]) =>
      h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(period === id), on: { click: () => { period = id; draw(); root.querySelector(`.seg-btn[aria-pressed=true]`)?.focus(); } } }, label)));

    // big figures: a regular no-break space, the narrow one used by Intl almost vanishes at display sizes
    const tile = (label, value, sub, hero) => h('div', { class: ['kpi', hero && 'kpi-hero'] }, h('p', { class: 'kpi-label' }, label), h('p', { class: 'kpi-value' }, value.replace(/\u202f/g, '\u00a0')), h('p', { class: 'kpi-sub' }, sub));
    const pending = st.docs.filter((d) => d.kind === 'devis' && statusOf(d, t) === 'envoyé').sort((a, b) => a.date.localeCompare(b.date));
    const activity = st.docs.flatMap((d) => d.log.map((l) => ({ ...l, d }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

    mount(root,
      pageHead('Tableau de bord', `Bonjour Antoine · ${shortDate(t)}`,
        h('a', { class: 'btn btn-primary', href: '#/devis/nouveau' }, '+ Nouveau devis')),
      filter,
      h('div', { class: 'kpis' },
        tile('Encaissé HT', euro0.format(cashed), PERIODS.find(([id]) => id === period)[1].toLowerCase(), true),
        tile('Facturé HT', euro0.format(billed), `${invoices.filter((d) => inPeriod(d.date)).length} factures émises`),
        tile('Reste à encaisser', euro0.format(openSum), late.length ? `dont ${euro0.format(lateSum)} en retard (${late.length})` : 'aucun retard', false),
        tile('Devis acceptés', `${rate} %`, `${won.length} sur ${decided.length} devis tranchés`)),
      h('div', { class: 'grid-2' },
        columnChart({ title: 'Chiffre d’affaires encaissé par mois', subtitle: 'Montants hors taxes, à la date du paiement', points, tableHead: ['Mois', 'Encaissé HT', 'Factures'] }),
        barList({ title: 'Meilleurs clients', subtitle: 'Encaissé HT sur la période', rows: top })),
      h('div', { class: 'grid-2' },
        h('section', { class: 'card', 'aria-labelledby': 'late-t' },
          h('h2', { id: 'late-t', class: 'card-title' }, 'À relancer', h('span', { class: 'count' }, String(late.length))),
          late.length ? h('ul', { class: 'rows' }, late.sort((a, b) => a.due.localeCompare(b.due)).map((d) => {
            const days = Math.round((new Date(t) - new Date(d.due)) / 864e5);
            return h('li', { class: 'row' },
              h('div', null, h('a', { href: docPath(d), class: 'row-title' }, clientById(d.client).name), h('p', { class: 'muted small' }, `${d.number} · échue depuis ${days} j${d.reminders ? ` · relancée ${d.reminders}×` : ''}`)),
              h('div', { class: 'row-end' }, h('strong', { class: 'num' }, money(totals(d).ttc)),
                h('button', { type: 'button', class: 'btn btn-ghost btn-xs', on: { click: () => reminderDialog(d.id) } }, 'Relancer', h('span', { class: 'sr' }, ` ${clientById(d.client).name}`))));
          })) : h('p', { class: 'muted' }, 'Aucune facture en retard. 🎉')),
        h('section', { class: 'card', 'aria-labelledby': 'pend-t' },
          h('h2', { id: 'pend-t', class: 'card-title' }, 'Devis en attente de réponse', h('span', { class: 'count' }, String(pending.length))),
          pending.length ? h('ul', { class: 'rows' }, pending.map((d) => h('li', { class: 'row' },
            h('div', null, h('a', { href: docPath(d), class: 'row-title' }, clientById(d.client).name), h('p', { class: 'muted small' }, `${d.number} · ${d.subject || ''} · envoyé le ${shortDate(d.date)}`)),
            h('div', { class: 'row-end' }, h('strong', { class: 'num' }, money(totals(d).ttc)), statusChip(d))))) : h('p', { class: 'muted' }, 'Aucun devis en attente.'))),
      h('section', { class: 'card', 'aria-labelledby': 'act-t' },
        h('h2', { id: 'act-t', class: 'card-title' }, 'Activité récente'),
        h('ol', { class: 'feed' }, activity.map((a) => h('li', null,
          h('span', { class: 'feed-date' }, shortDate(a.at)),
          h('span', null, h('a', { href: docPath(a.d) }, a.d.number || 'Brouillon'), ` · ${clientById(a.d.client)?.name || ''} · ${a.text}`))))));
  }

  draw();
  return store.subscribe(draw);
}
