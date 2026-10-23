import { useMemo, useState } from 'react';
import { can, type StaffAccount } from '../domain/catalog';
import { daysBetween, isoDate, lastMonths, monthKey, parseDate, statusOf, totals } from '../domain/rules';
import type { Doc, Invoice } from '../domain/schema';
import { useFormat } from '../format';
import { useBooks } from '../state/app';
import { Link, usePage } from '../shared/router';
import { useNow } from '../shared/useNow';
import { BarList, ColumnChart, type Point } from '../ui/charts';
import { docPath, PageHead, StatusChip } from '../ui/common';
import { ReminderDialog } from './dialogs';

export default function Dashboard({ staff }: { staff: StaffAccount }) {
  const { t, money, money0, shortDate, locale, history } = useFormat();
  usePage(t('title.dashboard'));
  const state = useBooks((s) => s);
  const today = isoDate(useNow(60_000));
  const year = Number(today.slice(0, 4));
  const periods: [string, string][] = [['12m', t('dash.last12')], [String(year), t('dash.year', { year })], [String(year - 1), t('dash.year', { year: year - 1 })]];
  const [period, setPeriod] = useState('12m');
  const [reminding, setReminding] = useState<string | null>(null);

  const data = useMemo(() => {
    const keys = period === '12m' ? lastMonths(12, today) : Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
    const inPeriod = (iso: string) => !!iso && keys.includes(monthKey(iso));
    const ht = (d: Doc) => totals(d.lines).ht;
    const ttc = (d: Doc) => totals(d.lines).ttc;
    const invoices = state.docs.filter((d): d is Invoice => d.kind === 'invoice' && d.status !== 'draft');
    const paid = invoices.filter((d) => d.status === 'paid' && inPeriod(d.paidAt));
    const open = invoices.filter((d) => d.status === 'issued');
    const late = open.filter((d) => statusOf(d, today) === 'late').sort((a, b) => a.due.localeCompare(b.due));
    const quotes = state.docs.filter((d) => d.kind === 'quote' && d.status !== 'draft' && inPeriod(d.date));
    const decided = quotes.filter((d) => ['accepted', 'refused', 'expired'].includes(statusOf(d, today)));
    const won = decided.filter((d) => d.status === 'accepted');
    const month = (k: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts).format(parseDate(`${k}-01`));
    const points: Point[] = keys.map((k) => {
      const list = paid.filter((d) => monthKey(d.paidAt) === k);
      return { key: k, label: month(k, { month: 'short' }).replace('.', ''), long: month(k, { month: 'long', year: 'numeric' }), value: list.reduce((s, d) => s + ht(d), 0), sub: t('dash.paidCount', { n: list.length }) };
    });
    const byClient = new Map<string, number>();
    for (const d of paid) byClient.set(d.client, (byClient.get(d.client) ?? 0) + ht(d));
    const top = [...byClient].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, value]) => ({ label: state.clients.find((c) => c.id === id)?.name ?? '—', value, to: `/clients/${id}` }));
    const pending = state.docs.filter((d) => d.kind === 'quote' && statusOf(d, today) === 'sent').sort((a, b) => a.date.localeCompare(b.date));
    const activity = state.docs.flatMap((d) => d.history.map((h) => ({ h, d }))).sort((a, b) => b.h.at.localeCompare(a.h.at)).slice(0, 8);
    return {
      cashed: paid.reduce((s, d) => s + ht(d), 0), billed: invoices.filter((d) => inPeriod(d.date)).reduce((s, d) => s + ht(d), 0),
      billedCount: invoices.filter((d) => inPeriod(d.date)).length, open: open.reduce((s, d) => s + ttc(d), 0), late, lateSum: late.reduce((s, d) => s + ttc(d), 0),
      rate: decided.length ? Math.round((won.length / decided.length) * 100) : 0, won: won.length, decided: decided.length, points, top, pending, activity,
    };
  }, [state, period, today, locale, t]);
  const client = (id: string) => state.clients.find((c) => c.id === id)?.name ?? '—';
  // the narrow no-break space Intl uses almost vanishes at display sizes: a regular one instead
  const nb = (s: string) => s.split(String.fromCharCode(0x202f)).join(String.fromCharCode(0xa0));

  return (
    <>
      <PageHead title={t('nav.dashboard')} sub={t('dash.hello', { name: staff.name.split(' ')[0] ?? staff.name, date: shortDate(today) })}>
        {can(staff.role, 'docs.edit') ? <Link className="btn btn-primary" to="/devis/nouveau">{t('docs.newQuote')}</Link> : null}
      </PageHead>
      <div className="seg" role="group" aria-label={t('dash.period')}>
        {periods.map(([id, label]) => <button key={id} type="button" className="seg-btn" aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}
      </div>
      <div className="kpis">
        <div className="kpi kpi-hero"><p className="kpi-label">{t('dash.cashed')}</p><p className="kpi-value">{nb(money0(data.cashed))}</p><p className="kpi-sub">{periods.find(([id]) => id === period)?.[1].toLowerCase()}</p></div>
        <div className="kpi"><p className="kpi-label">{t('dash.billed')}</p><p className="kpi-value">{nb(money0(data.billed))}</p><p className="kpi-sub">{t('dash.billedCount', { n: data.billedCount })}</p></div>
        <div className="kpi"><p className="kpi-label">{t('dash.open')}</p><p className="kpi-value">{nb(money0(data.open))}</p><p className="kpi-sub">{data.late.length ? t('dash.openLate', { amount: money0(data.lateSum), n: data.late.length }) : t('dash.noLate')}</p></div>
        <div className="kpi"><p className="kpi-label">{t('dash.rate')}</p><p className="kpi-value">{data.rate} %</p><p className="kpi-sub">{t('dash.rateSub', { won: data.won, n: data.decided })}</p></div>
      </div>
      <div className="grid-2">
        <ColumnChart title={t('dash.chart')} subtitle={t('dash.chartSub')} points={data.points} head={[t('dash.month'), t('dash.cashed'), t('dash.invoices')]} />
        <BarList title={t('dash.best')} subtitle={t('dash.bestSub')} rows={data.top} />
      </div>
      <div className="grid-2">
        <section className="card" aria-labelledby="late-t">
          <h2 id="late-t" className="card-title">{t('dash.toChase')} <span className="count">{data.late.length}</span></h2>
          {data.late.length ? (
            <ul className="rows">
              {data.late.map((d) => (
                <li key={d.id} className="row">
                  <div><Link to={docPath(d)} className="row-title">{client(d.client)}</Link><p className="muted small">{d.number} · {t('dash.lateFor', { n: daysBetween(d.due, today) })}{d.reminders ? ` · ${t('dash.reminded', { n: d.reminders })}` : ''}</p></div>
                  <div className="row-end">
                    <strong className="num">{money(totals(d.lines).ttc)}</strong>
                    {can(staff.role, 'reminders') ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => setReminding(d.id)}>{t('dash.remind')}<span className="sr"> {client(d.client)}</span></button> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('dash.noLateList')}</p>}
        </section>
        <section className="card" aria-labelledby="pend-t">
          <h2 id="pend-t" className="card-title">{t('dash.pending')} <span className="count">{data.pending.length}</span></h2>
          {data.pending.length ? (
            <ul className="rows">
              {data.pending.map((d) => (
                <li key={d.id} className="row">
                  <div><Link to={docPath(d)} className="row-title">{client(d.client)}</Link><p className="muted small">{d.number} · {d.subject} · {t('dash.sentOn', { date: shortDate(d.date) })}</p></div>
                  <div className="row-end"><strong className="num">{money(totals(d.lines).ttc)}</strong><StatusChip doc={d} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('dash.noPending')}</p>}
        </section>
      </div>
      <section className="card" aria-labelledby="act-t">
        <h2 id="act-t" className="card-title">{t('dash.activity')}</h2>
        <ol className="feed">
          {data.activity.map(({ h, d }, i) => (
            <li key={`${d.id}-${i}`}><span className="feed-date">{shortDate(h.at)}</span><span><Link to={docPath(d)}>{d.number || t('doc.draft')}</Link> · {client(d.client)} · {history(h)}</span></li>
          ))}
        </ol>
      </section>
      {reminding ? <ReminderDialog id={reminding} staff={staff} onClose={() => setReminding(null)} /> : null}
    </>
  );
}
