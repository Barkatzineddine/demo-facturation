// The client portal: what a client sees through their private link (16 random characters, about 80
// bits). No account: the link is the credential, so the page only shows that client's documents.
import { useEffect, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { isoDate, statusOf, totals } from '../domain/rules';
import type { Doc, Quote } from '../domain/schema';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { acceptQuote, markViewed, payOnline, refuseQuote, useBooks } from '../state/app';
import { useStaff } from '../state/session';
import { Link, usePage } from '../shared/router';
import { useFormGuard } from '../shared/formGuard';
import { clean } from '../shared/security';
import { Dialog } from '../shared/ui/Dialog';
import { useFeedback } from '../shared/ui/Feedback';
import { Checkbox, Field, Honeypot, TextArea } from '../shared/ui/Field';
import { downloadPdf, StatusChip } from '../ui/common';

export function PortalPicker() {
  const { t } = useFormat();
  usePage(t('title.portal'));
  const clients = useBooks((s) => s.clients);
  const docs = useBooks((s) => s.docs);
  const today = isoDate(new Date());
  return (
    <>
      <header className="page-head"><div><h1 tabIndex={-1}>{t('nav.portal')}</h1><p className="muted">{t('portal.pickerLead')}</p></div></header>
      <section className="card">
        <h2 className="card-title">{t('portal.viewAs')}</h2>
        <ul className="rows">
          {clients.map((c) => {
            const waiting = docs.filter((d) => d.client === c.id && ((d.kind === 'quote' && statusOf(d, today) === 'sent') || (d.kind === 'invoice' && d.status === 'issued'))).length;
            return (
              <li key={c.id} className="row">
                <div><Link className="row-title" to={`/portail/${c.token}`}>{c.name}</Link><p className="muted small">{c.contact} · {c.city}</p></div>
                <div className="row-end">{waiting ? <span className="chip tone-info"><span className="chip-ic" aria-hidden="true">●</span>{t('portal.toHandle', { n: waiting })}</span> : <span className="muted small">{t('portal.upToDate')}</span>}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

export function Portal({ token }: { token: string }) {
  const { t, money, shortDate } = useFormat();
  const { confirm, toast } = useFeedback();
  const client = useBooks((s) => s.clients.find((c) => c.id && c.token === token));
  const docs = useBooks((s) => s.docs);
  const staff = useStaff((s) => s.staff);
  usePage(client ? t('title.portalOf', { name: client.name }) : t('portal.invalid'));
  const today = isoDate(new Date());
  const mine = client ? docs.filter((d) => d.client === client.id && d.status !== 'draft') : [];
  const quotes = mine.filter((d): d is Quote => d.kind === 'quote' && statusOf(d, today) === 'sent');
  const unpaid = mine.filter((d) => d.kind === 'invoice' && d.status === 'issued');
  const archive = mine.filter((d) => !quotes.includes(d as Quote) && !unpaid.includes(d)).sort((a, b) => b.date.localeCompare(a.date));
  const pendingIds = quotes.map((q) => q.id).join(',');

  // the first opening of each pending quote goes into its history, like a read receipt (not for staff previews)
  useEffect(() => {
    if (!client || staff) return;
    for (const id of pendingIds.split(',').filter(Boolean)) markViewed(id, client.contact);
  }, [pendingIds, client, staff]);

  if (!client) {
    return <div className="portal"><header className="page-head"><div><h1 tabIndex={-1}>{t('portal.invalid')}</h1><p className="muted">{t('portal.invalidText')}</p></div></header></div>;
  }
  const first = client.contact.replace(/^(Dr|M\.|Mme)\s+/, '').split(' ')[0] ?? client.contact;
  const pay = async (d: Doc) => {
    const ok = await confirm({ title: t('portal.payTitle', { amount: money(totals(d.lines).ttc) }), body: t('portal.payBody'), ok: t('portal.payOk'), cancel: t('common.cancel') });
    if (!ok) return;
    const error = payOnline(d.id, client.contact);
    toast(error ? t(`err.${error}` as Key) : t('portal.paid'), error ? 'err' : 'ok');
  };

  return (
    <div className="portal">
      {staff ? <p className="portal-banner" role="note"><strong>{t('portal.staffView')}</strong> · {t('portal.staffViewText', { name: client.contact })} <Link to="/portail">{t('portal.switch')}</Link></p> : null}
      <header className="portal-head">
        <p className="muted small">{t('portal.brand')}</p>
        <h1 tabIndex={-1}>{t('portal.hello', { name: first })}</h1>
        <p className="muted">{quotes.length || unpaid.length ? t('portal.summary', { q: quotes.length, i: unpaid.length }) : t('portal.allDone')}</p>
      </header>
      {quotes.map((q) => <QuoteCard key={q.id} quote={q} />)}
      {unpaid.length ? (
        <section className="card">
          <h2 className="card-title">{t('portal.toPay')}</h2>
          <ul className="rows">
            {unpaid.map((d) => (
              <li key={d.id} className="row">
                <div><p className="row-title">{t('doc.invoice')} {d.number}</p><p className="muted small">{d.subject} · {d.kind === 'invoice' ? t('docs.dueOn', { date: shortDate(d.due) }) : ''}</p></div>
                <div className="row-end">
                  <strong className="num">{money(totals(d.lines).ttc)}</strong><StatusChip doc={d} />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => downloadPdf(d)}>PDF<span className="sr"> {d.number}</span></button>
                  <button type="button" className="btn btn-primary btn-xs" onClick={() => void pay(d)}>{t('portal.pay')}<span className="sr"> {d.number}</span></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card">
        <h2 className="card-title">{t('portal.archive')}</h2>
        {archive.length ? (
          <ul className="rows">
            {archive.map((d) => (
              <li key={d.id} className="row">
                <div><p className="row-title">{t(d.kind === 'quote' ? 'doc.quote' : 'doc.invoice')} {d.number}</p><p className="muted small">{d.subject} · {shortDate(d.date)}</p></div>
                <div className="row-end"><strong className="num">{money(totals(d.lines).ttc)}</strong><StatusChip doc={d} />
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => downloadPdf(d)}>PDF<span className="sr"> {d.number}</span></button></div>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('portal.noArchive')}</p>}
      </section>
      <p className="muted small">{t('portal.securityNote')}</p>
    </div>
  );
}

function QuoteCard({ quote: d }: { quote: Quote }) {
  const { t, money, longDate, qty } = useFormat();
  const { toast } = useFeedback();
  const tt = totals(d.lines);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; agree?: string }>({});
  const [refusing, setRefusing] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const who = clean(name, 80);
    const next: typeof errors = {};
    if (!(/^[\p{L}][\p{L}\p{M}' .-]{2,79}$/u.test(who) && who.includes(' '))) next.name = t('portal.err.name');
    if (!agree) next.agree = t('portal.err.agree');
    flushSync(() => setErrors(next));
    if (next.name || next.agree) { document.querySelector<HTMLElement>(`#q-${d.id} ~ form [aria-invalid="true"], .quote-card [aria-invalid="true"]`)?.focus(); return; }
    setBusy(true);
    const error = await acceptQuote(d.id, who, 'online', null);
    setBusy(false);
    toast(error ? t(`err.${error}` as Key) : t('portal.accepted'), error ? 'err' : 'ok');
  };
  return (
    <section className="card quote-card" aria-labelledby={`q-${d.id}`}>
      <div className="qc-head">
        <div><h2 id={`q-${d.id}`} className="card-title">{t('doc.quote')} {d.number} · {d.subject}</h2><p className="muted small">{t('portal.quoteDates', { date: longDate(d.date), until: longDate(d.validUntil) })}</p></div>
        <p className="qc-total"><span className="muted small">{t('totals.ttc')}</span><strong>{money(tt.ttc)}</strong></p>
      </div>
      <ul className="qc-lines">{d.lines.map((l, i) => <li key={i}><span>{l.label} ({qty(l.qty)} {l.unit})</span><span className="num">{money(Math.round(l.qty * l.price))}</span></li>)}</ul>
      <p className="muted small">{t('portal.vatDeposit', { vat: money(tt.vat) })}</p>
      <form className="form sign" noValidate onSubmit={(e) => void submit(e)}>
        <Field label={t('portal.signer')} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Checkbox label={t('portal.agree', { amount: money(tt.ttc) })} checked={agree} onChange={(e) => setAgree(e.target.checked)} error={errors.agree} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{t('portal.sign')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => downloadPdf(d)}>{t('doc.pdf')}</button>
          <button type="button" className="btn btn-danger" onClick={() => setRefusing(true)}>{t('portal.refuse')}</button>
        </div>
      </form>
      {refusing ? <RefuseDialog quote={d} onClose={() => setRefusing(false)} /> : null}
    </section>
  );
}

function RefuseDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const client = useBooks((s) => s.clients.find((c) => c.id === quote.client));
  const [reason, setReason] = useState('');
  // the one free-text form open to anyone holding a link: honeypot, no links, a few sends per device
  const guard = useFormGuard({ key: 'refuse', max: 5, minMs: 0, maxLinks: 0 });
  return (
    <Dialog open onClose={onClose} title={t('portal.refuseTitle')}>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        const note = clean(reason, 300, true);
        const verdict = guard.check(note);
        if (!verdict.ok) {
          if (verdict.silent) onClose();
          else toast(verdict.reason === 'rate-limited' ? t('err.rate', { n: verdict.waitMinutes ?? 1 }) : t('err.links'), 'err');
          return;
        }
        verdict.commit();
        const error = refuseQuote(quote.id, client?.contact ?? '', note, null);
        toast(error ? t(`err.${error}` as Key) : t('portal.refused'), error ? 'err' : 'ok');
        onClose();
      }}>
        <TextArea label={t('portal.refuseReason')} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Honeypot inputRef={guard.honeypotRef} label={t('honeypot')} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-danger">{t('portal.refuseOk')}</button>
        </div>
      </form>
    </Dialog>
  );
}
