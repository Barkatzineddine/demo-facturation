import { useDeferredValue, useState } from 'react';
import { can, INVOICE_STATUSES, QUOTE_STATUSES, type InvoiceView, type QuoteView, type StaffAccount } from '../domain/catalog';
import { isoDate, statusOf, totals } from '../domain/rules';
import type { Doc, Invoice } from '../domain/schema';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { useBooks } from '../state/app';
import { Link, usePage } from '../shared/router';
import { csv, download } from '../shared/security';
import { useFeedback } from '../shared/ui/Feedback';
import { docPath, PageHead, StatusChip } from '../ui/common';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export default function DocList({ kind, staff }: { kind: Doc['kind']; staff: StaffAccount }) {
  const { t, money, shortDate, statusLabel } = useFormat();
  const { toast } = useFeedback();
  const isQuote = kind === 'quote';
  usePage(t(isQuote ? 'title.quotes' : 'title.invoices'));
  const docs = useBooks((s) => s.docs);
  const clients = useBooks((s) => s.clients);
  const [filter, setFilter] = useState<QuoteView | InvoiceView | ''>('');
  const [q, setQ] = useState('');
  const query = fold(useDeferredValue(q).trim());
  const today = isoDate(new Date());
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? '—';

  const all = docs.filter((d) => d.kind === kind);
  const counts = new Map<string, number>();
  for (const d of all) counts.set(statusOf(d, today), (counts.get(statusOf(d, today)) ?? 0) + 1);
  const statuses: (QuoteView | InvoiceView)[] = isQuote ? [...QUOTE_STATUSES, 'expired'] : [...INVOICE_STATUSES, 'late'];
  const list = all
    .filter((d) => !filter || statusOf(d, today) === filter)
    .filter((d) => !query || fold(`${d.number} ${name(d.client)} ${d.subject}`).includes(query))
    .sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft') || b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  let summary: string;
  if (isQuote) {
    const pending = all.filter((d) => statusOf(d, today) === 'sent');
    summary = t('docs.quotesSummary', { n: pending.length, amount: money(pending.reduce((s, d) => s + totals(d.lines).ht, 0)) });
  } else {
    const open = all.filter((d) => d.status === 'issued');
    const late = open.filter((d) => statusOf(d, today) === 'late');
    const sum = (l: Doc[]) => l.reduce((s, d) => s + totals(d.lines).ttc, 0);
    summary = t('docs.invoicesSummary', { open: money(sum(open)), late: money(sum(late)) });
  }

  const exportJournal = () => {
    const issued = all.filter((d): d is Invoice => d.kind === 'invoice' && d.status !== 'draft').sort((a, b) => a.number.localeCompare(b.number));
    const fmt = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
    const rows = [[t('csv.number'), t('csv.date'), t('csv.client'), t('csv.subject'), t('csv.ht'), t('csv.vat'), t('csv.ttc'), t('csv.due'), t('csv.status'), t('csv.paidAt'), t('csv.method')],
      ...issued.map((d) => { const tt = totals(d.lines); return [d.number, d.date, name(d.client), d.subject, fmt(tt.ht), fmt(tt.vat), fmt(tt.ttc), d.due, statusLabel('invoice', statusOf(d, today)), d.paidAt, d.payMethod ? t(`pay.${d.payMethod}` as Key) : '']; })];
    download(`journal-des-ventes-${today}.csv`, csv(rows), 'text/csv;charset=utf-8');
    toast(t('docs.exported', { n: issued.length }));
  };

  return (
    <>
      <PageHead title={t(isQuote ? 'nav.quotes' : 'nav.invoices')} sub={summary}>
        {!isQuote && can(staff.role, 'export') ? <button type="button" className="btn btn-ghost" onClick={exportJournal}>{t('docs.journal')}</button> : null}
        {can(staff.role, 'docs.edit') ? <Link className="btn btn-primary" to={isQuote ? '/devis/nouveau' : '/factures/nouveau'}>{t(isQuote ? 'docs.newQuote' : 'docs.newInvoice')}</Link> : null}
      </PageHead>
      <div className="toolbar">
        <div className="seg" role="group" aria-label={t('docs.filter')}>
          <button type="button" className="seg-btn" aria-pressed={!filter} onClick={() => setFilter('')}>{t('common.all')} <span className="seg-n">{all.length}</span></button>
          {statuses.map((s) => (
            <button key={s} type="button" className="seg-btn" aria-pressed={filter === s} onClick={() => setFilter(s)}>{statusLabel(kind, s)} <span className="seg-n">{counts.get(s) ?? 0}</span></button>
          ))}
        </div>
        <div className="field search">
          <label htmlFor="doc-q" className="sr">{t('docs.search')}</label>
          <input id="doc-q" type="search" maxLength={40} autoComplete="off" placeholder={t('docs.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <p className="muted small" aria-live="polite">{t('docs.count', { n: list.length })}</p>
      {list.length ? (
        <ul className="doc-list">
          {list.slice(0, 80).map((d) => {
            const st = statusOf(d, today);
            const when = d.kind === 'quote'
              ? (st === 'sent' ? t('docs.validUntil', { date: shortDate(d.validUntil) }) : t('docs.dated', { date: shortDate(d.date) }))
              : d.status === 'paid' ? t('docs.paidOn', { date: shortDate(d.paidAt) }) : d.status === 'draft' ? t('docs.notIssued') : t('docs.dueOn', { date: shortDate(d.due) });
            return (
              <li key={d.id} className="doc-row">
                <Link to={docPath(d)} className="doc-link">
                  <span className="doc-num">{d.number || t('doc.draft')}</span>
                  <span className="doc-client">{name(d.client)}<span className="muted small doc-subject">{d.subject}</span></span>
                  <span className="doc-when muted small">{when}</span>
                  <span className="doc-amount num">{money(totals(d.lines).ttc)}</span>
                  <span className="doc-status"><StatusChip doc={d} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <div className="empty card"><p>{t('docs.none')}</p></div>}
    </>
  );
}
