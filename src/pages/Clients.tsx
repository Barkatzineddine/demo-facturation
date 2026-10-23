import { useDeferredValue, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { can, type StaffAccount } from '../domain/catalog';
import { isoDate, statusOf, totals } from '../domain/rules';
import type { Client, Doc } from '../domain/schema';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { newToken, rotateToken, saveClient, useBooks } from '../state/app';
import { Link, navigate, useLocation, usePage } from '../shared/router';
import { clean, isEmail, isName, isPhoneFR, normPhone, randomId } from '../shared/security';
import { Dialog } from '../shared/ui/Dialog';
import { useFeedback } from '../shared/ui/Feedback';
import { Field } from '../shared/ui/Field';
import { docPath, PageHead, StatusChip } from '../ui/common';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function figures(docs: readonly Doc[], clientId: string, today: string) {
  const mine = docs.filter((d) => d.client === clientId);
  const paid = mine.filter((d) => d.kind === 'invoice' && d.status === 'paid');
  const open = mine.filter((d) => d.kind === 'invoice' && d.status === 'issued');
  const decided = mine.filter((d) => d.kind === 'quote' && ['accepted', 'refused', 'expired'].includes(statusOf(d, today)));
  return {
    docs: mine,
    cashed: paid.reduce((s, d) => s + totals(d.lines).ht, 0),
    open: open.reduce((s, d) => s + totals(d.lines).ttc, 0),
    late: open.filter((d) => statusOf(d, today) === 'late').length,
    rate: decided.length ? Math.round((decided.filter((d) => d.status === 'accepted').length / decided.length) * 100) : null,
  };
}

export function ClientList({ staff }: { staff: StaffAccount }) {
  const { t, money } = useFormat();
  usePage(t('title.clients'));
  const clients = useBooks((s) => s.clients);
  const docs = useBooks((s) => s.docs);
  const { query } = useLocation();
  const [q, setQ] = useState('');
  const needle = fold(useDeferredValue(q).trim());
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  // #/clients?nouveau=1 (link from the quote editor) opens the creation form
  const creating = query.get('nouveau') === '1' && can(staff.role, 'clients.edit');
  const closeDialog = () => { setEditing(null); if (creating) navigate('/clients', { replace: true }); };
  const today = isoDate(new Date());
  const list = clients.filter((c) => !needle || fold(`${c.name} ${c.city} ${c.contact}`).includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return (
    <>
      <PageHead title={t('nav.clients')} sub={t('clients.count', { n: clients.length })}>
        {can(staff.role, 'clients.edit') ? <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>{t('clients.new')}</button> : null}
      </PageHead>
      <div className="toolbar">
        <div className="field search"><label htmlFor="cl-q" className="sr">{t('clients.search')}</label>
          <input id="cl-q" type="search" maxLength={40} autoComplete="off" placeholder={t('clients.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <ul className="client-grid">
        {list.map((c) => {
          const f = figures(docs, c.id, today);
          return (
            <li key={c.id} className="card client-card">
              <div className="cl-head">
                <span className="avatar" aria-hidden="true">{c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                <div><h2 className="client-name"><Link to={`/clients/${c.id}`} className="stretched">{c.name}</Link></h2><p className="muted small">{t(c.type === 'pro' ? 'clients.pro' : 'clients.part')} · {c.city}</p></div>
              </div>
              <dl className="mini-facts">
                <div><dt>{t('clients.cashed')}</dt><dd className="num">{money(f.cashed)}</dd></div>
                <div><dt>{t('clients.open')}</dt><dd className="num">{money(f.open)}{f.late ? <span className="chip tone-bad chip-xs"><span className="chip-ic" aria-hidden="true">!</span>{t('clients.late', { n: f.late })}</span> : null}</dd></div>
              </dl>
            </li>
          );
        })}
      </ul>
      {!list.length ? <p className="muted">{t('clients.none')}</p> : null}
      {editing || creating ? <ClientDialog client={editing && editing !== 'new' ? editing : null} staff={staff} onClose={closeDialog} /> : null}
    </>
  );
}

export function ClientPage({ id, staff }: { id: string; staff: StaffAccount }) {
  const { t, money, shortDate } = useFormat();
  const { confirm, toast } = useFeedback();
  const client = useBooks((s) => s.clients.find((c) => c.id === id));
  const docs = useBooks((s) => s.docs);
  const [editing, setEditing] = useState(false);
  usePage(client ? `${client.name} · Morel Agencement` : t('clients.notFound'));
  if (!client) return <PageHead title={t('clients.notFound')}><Link className="btn btn-ghost" to="/clients">{t('doc.backToList')}</Link></PageHead>;
  const today = isoDate(new Date());
  const f = figures(docs, client.id, today);
  const list = [...f.docs].sort((a, b) => b.date.localeCompare(a.date));
  const rotate = async () => {
    if (!(await confirm({ title: t('clients.rotateTitle'), body: t('clients.rotateBody'), ok: t('clients.rotateOk'), cancel: t('common.cancel'), danger: true }))) return;
    const error = rotateToken(client.id, staff);
    toast(error ? t(`err.${error}` as Key) : t('clients.rotated'), error ? 'err' : 'ok');
  };
  return (
    <>
      <Link className="back" to="/clients">← {t('nav.clients')}</Link>
      <PageHead title={client.name} sub={`${t(client.type === 'pro' ? 'clients.pro' : 'clients.part')} · ${t('clients.since', { date: shortDate(client.created) })}`}>
        {can(staff.role, 'clients.edit') ? <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>{t('common.edit')}</button> : null}
        <Link className="btn btn-ghost" to={`/portail/${client.token}`}>{t('clients.portal')}</Link>
        {can(staff.role, 'docs.edit') ? <Link className="btn btn-primary" to={`/devis/nouveau?client=${client.id}`}>{t('clients.newQuote')}</Link> : null}
      </PageHead>
      <div className="kpis kpis-3">
        <div className="kpi"><p className="kpi-label">{t('clients.cashed')}</p><p className="kpi-value">{money(f.cashed)}</p><p className="kpi-sub">{t('clients.sinceStart')}</p></div>
        <div className="kpi"><p className="kpi-label">{t('clients.openTtc')}</p><p className="kpi-value">{money(f.open)}</p><p className="kpi-sub">{f.late ? t('clients.late', { n: f.late }) : t('dash.noLate')}</p></div>
        <div className="kpi"><p className="kpi-label">{t('dash.rate')}</p><p className="kpi-value">{f.rate === null ? '—' : `${f.rate} %`}</p><p className="kpi-sub">{t('clients.decided')}</p></div>
      </div>
      <div className="doc-grid">
        <section className="card">
          <h2 className="card-title">{t('clients.docs')}</h2>
          {list.length ? (
            <ul className="rows">
              {list.map((d) => (
                <li key={d.id} className="row">
                  <div><Link to={docPath(d)} className="row-title">{t(d.kind === 'quote' ? 'doc.quote' : 'doc.invoice')} {d.number || t('doc.draft')}</Link><p className="muted small">{d.subject} · {shortDate(d.date)}</p></div>
                  <div className="row-end"><strong className="num">{money(totals(d.lines).ttc)}</strong><StatusChip doc={d} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('clients.noDocs')}</p>}
        </section>
        <aside className="card">
          <h2 className="card-title">{t('clients.details')}</h2>
          <dl className="facts">
            <div><dt>{t('clients.contact')}</dt><dd>{client.contact}</dd></div>
            <div><dt>{t('field.email')}</dt><dd><a href={`mailto:${client.email}`}>{client.email}</a></dd></div>
            <div><dt>{t('field.phone')}</dt><dd><a href={`tel:${client.phone.replace(/\s/g, '')}`}>{client.phone}</a></dd></div>
            <div><dt>{t('field.address')}</dt><dd>{client.address}, {client.zip} {client.city}</dd></div>
            {client.siret ? <div><dt>SIRET</dt><dd>{client.siret}</dd></div> : null}
          </dl>
          {can(staff.role, 'clients.edit') ? <p className="small"><button type="button" className="linklike" onClick={() => void rotate()}>{t('clients.rotate')}</button></p> : null}
        </aside>
      </div>
      {editing ? <ClientDialog client={client} staff={staff} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function ClientDialog({ client, staff, onClose }: { client: Client | null; staff: StaffAccount; onClose: () => void }) {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const [v, setV] = useState({
    type: client?.type ?? 'pro', name: client?.name ?? '', contact: client?.contact ?? '', email: client?.email ?? '', phone: client?.phone ?? '',
    address: client?.address ?? '', zip: client?.zip ?? '', city: client?.city ?? '', siret: client?.siret ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = {
      type: v.type, name: clean(v.name, 80), contact: clean(v.contact, 80), email: clean(v.email, 254).toLowerCase(), phone: clean(v.phone, 20),
      address: clean(v.address, 120), zip: clean(v.zip, 5), city: clean(v.city, 60), siret: clean(v.siret, 20).replace(/\s/g, ''),
    };
    const next: Record<string, string> = {};
    if (c.name.length < 2) next.name = t('clients.err.name');
    if (!isName(c.contact.replace(/^(Dr|M\.|Mme)\s+/, ''))) next.contact = t('clients.err.contact');
    if (!isEmail(c.email)) next.email = t('err.email');
    if (!isPhoneFR(c.phone)) next.phone = t('err.phone');
    if (c.address.length < 5) next.address = t('clients.err.address');
    if (!/^\d{5}$/.test(c.zip)) next.zip = t('clients.err.zip');
    if (c.city.length < 2) next.city = t('clients.err.city');
    if (c.siret && !/^\d{14}$/.test(c.siret)) next.siret = t('clients.err.siret');
    flushSync(() => setErrors(next));
    if (Object.keys(next).length) { document.querySelector<HTMLElement>('.client-form [aria-invalid="true"]')?.focus(); return; }
    const record: Client = {
      ...c, type: c.type === 'part' ? 'part' : 'pro', phone: normPhone(c.phone),
      siret: c.siret ? c.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4') : '',
      id: client?.id ?? randomId('c'), token: client?.token ?? newToken(), created: client?.created ?? isoDate(new Date()),
    };
    const error = saveClient(record, staff, client?.id ?? null);
    if (error) { toast(t(`err.${error}` as Key), 'err'); return; }
    toast(client ? t('clients.saved') : t('clients.created', { name: record.name }));
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={client ? t('clients.editTitle', { name: client.name }) : t('clients.newTitle')} wide>
      <form className="form client-form" noValidate onSubmit={submit}>
        <fieldset className="seg-field">
          <legend>{t('clients.type')}</legend>
          <label className="radio"><input type="radio" name="type" checked={v.type === 'pro'} onChange={() => set('type', 'pro')} />{t('clients.typePro')}</label>
          <label className="radio"><input type="radio" name="type" checked={v.type === 'part'} onChange={() => set('type', 'part')} />{t('clients.typePart')}</label>
        </fieldset>
        <div className="row2">
          <Field label={t('clients.name')} maxLength={80} autoComplete="organization" value={v.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <Field label={t('clients.contact')} maxLength={80} autoComplete="name" value={v.contact} onChange={(e) => set('contact', e.target.value)} error={errors.contact} />
        </div>
        <div className="row2">
          <Field label={t('field.email')} type="email" maxLength={254} autoComplete="email" value={v.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
          <Field label={t('field.phone')} type="tel" maxLength={20} autoComplete="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
        </div>
        <Field label={t('field.address')} maxLength={120} autoComplete="street-address" value={v.address} onChange={(e) => set('address', e.target.value)} error={errors.address} />
        <div className="row2">
          <Field label={t('field.zip')} maxLength={5} inputMode="numeric" autoComplete="postal-code" value={v.zip} onChange={(e) => set('zip', e.target.value)} error={errors.zip} />
          <Field label={t('field.city')} maxLength={60} autoComplete="address-level2" value={v.city} onChange={(e) => set('city', e.target.value)} error={errors.city} />
        </div>
        <Field label={t('clients.siret')} maxLength={20} inputMode="numeric" value={v.siret} onChange={(e) => set('siret', e.target.value)} error={errors.siret} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary">{client ? t('editor.save') : t('clients.create')}</button>
        </div>
      </form>
    </Dialog>
  );
}
