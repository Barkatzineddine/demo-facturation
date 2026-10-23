import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { can, CATALOG, UNITS, VAT_RATES, type StaffAccount, type Unit, type VatRate } from '../domain/catalog';
import { isoDate, lineTotal, statusOf, totals } from '../domain/rules';
import { lineSchema, type Doc, type Line, type Quote } from '../domain/schema';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import {
  acceptQuote, convertToInvoice, deleteDraft, duplicate, issueInvoice, newDraft, refuseQuote, saveDraft, sendQuote, useBooks, verifyProof,
} from '../state/app';
import { Link, navigate, useLocation, usePage } from '../shared/router';
import { clean, randomId } from '../shared/security';
import { useFeedback } from '../shared/ui/Feedback';
import { Field, Select, TextArea } from '../shared/ui/Field';
import { docPath, downloadPdf, HistoryCard, LinesTable, PageHead, StatusChip, TotalsBox } from '../ui/common';
import { PaymentDialog, ReminderDialog } from './dialogs';

type Kind = Doc['kind'];
const listPath = (kind: Kind) => (kind === 'quote' ? '/devis' : '/factures');

export default function DocPage({ kind, id, staff }: { kind: Kind; id: string; staff: StaffAccount }) {
  const { t } = useFormat();
  const doc = useBooks((s) => s.docs.find((d) => d.id === id));
  if (id === 'nouveau') return <Creating kind={kind} staff={staff} />;
  if (!doc || doc.kind !== kind) {
    return (
      <>
        <PageHead title={t('doc.notFound')} sub={t('doc.notFoundSub')}><Link className="btn btn-ghost" to={listPath(kind)}>{t('doc.backToList')}</Link></PageHead>
      </>
    );
  }
  return doc.status === 'draft' && can(staff.role, 'docs.edit') ? <Editor key={doc.id} doc={doc} staff={staff} /> : <View doc={doc} staff={staff} />;
}

/** #/devis/nouveau: creates the draft once, then replaces the address with the draft's own. */
function Creating({ kind, staff }: { kind: Kind; staff: StaffAccount }) {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const { query } = useLocation();
  const clients = useBooks((s) => s.clients);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const wanted = query.get('client');
    const client = clients.find((c) => c.id === wanted) ?? clients[0];
    const result = client ? newDraft(kind, client.id, staff) : { ok: false as const, error: 'not-found' as const };
    if (result.ok) navigate(`${listPath(kind)}/${result.id}`, { replace: true });
    else { toast(t(`err.${result.error}` as Key), 'err'); navigate(listPath(kind), { replace: true }); }
  }, [clients, kind, query, staff, t, toast]);
  return <div className="route-loading" aria-hidden="true" />;
}

// ---------- read-only view ----------
function View({ doc: d, staff }: { doc: Doc; staff: StaffAccount }) {
  const { t, money, longDate, time, docName } = useFormat();
  usePage(`${docName(d)} · Morel Agencement`);
  const { confirm, toast } = useFeedback();
  const client = useBooks((s) => s.clients.find((c) => c.id === d.client));
  const linked = useBooks((s) => s.docs.find((x) => x.id === (d.kind === 'quote' ? d.invoice : d.quote)));
  const [dialog, setDialog] = useState<'pay' | 'remind' | null>(null);
  const today = isoDate(new Date());
  const st = statusOf(d, today);
  const tt = totals(d.lines);
  const owner = can(staff.role, 'docs.edit');
  const fail = (error: string | null, ok: string) => toast(error ? t(`err.${error}` as Key) : ok, error ? 'err' : 'ok');

  const actions: React.ReactNode[] = [<button key="pdf" type="button" className="btn btn-ghost" onClick={() => downloadPdf(d)}>{t('doc.pdf')}</button>];
  if (d.kind === 'quote') {
    if (st === 'sent') {
      actions.push(<Link key="portal" className="btn btn-ghost" to={`/portail/${client?.token ?? ''}`}>{t('doc.clientView')}</Link>);
      if (owner) {
        actions.push(
          <button key="paper" type="button" className="btn btn-ghost" onClick={async () => {
            if (!(await confirm({ title: t('doc.paperTitle'), body: t('doc.paperBody', { name: client?.contact ?? '' }), ok: t('doc.paperOk'), cancel: t('common.cancel') }))) return;
            fail(await acceptQuote(d.id, client?.contact ?? '', 'paper', staff), t('doc.accepted'));
          }}>{t('doc.paper')}</button>,
          <button key="refuse" type="button" className="btn btn-danger" onClick={async () => {
            if (!(await confirm({ title: t('doc.refuseTitle'), ok: t('doc.refuseOk'), cancel: t('common.cancel'), danger: true }))) return;
            fail(refuseQuote(d.id, staff.name, '', staff), t('doc.refused'));
          }}>{t('doc.refuse')}</button>,
        );
      }
    }
    if (d.status === 'accepted' && !d.invoice && owner) {
      actions.push(<button key="convert" type="button" className="btn btn-primary" onClick={() => {
        const r = convertToInvoice(d.id, staff);
        if (r.ok) { toast(t('doc.converted')); navigate(`/factures/${r.id}`); } else fail(r.error, '');
      }}>{t('doc.convert')}</button>);
    }
    if (d.invoice) actions.push(<Link key="inv" className="btn btn-ghost" to={`/factures/${d.invoice}`}>{t('doc.seeInvoice')}</Link>);
    if (owner) actions.push(<button key="dup" type="button" className="btn btn-ghost" onClick={() => { const r = duplicate(d.id, staff); if (r.ok) navigate(`/devis/${r.id}`); }}>{t('doc.duplicate')}</button>);
  } else if (d.status === 'issued') {
    actions.push(<Link key="portal" className="btn btn-ghost" to={`/portail/${client?.token ?? ''}`}>{t('doc.clientView')}</Link>);
    if (st === 'late' && can(staff.role, 'reminders')) actions.push(<button key="remind" type="button" className="btn btn-ghost" onClick={() => setDialog('remind')}>{t('dash.remind')}</button>);
    if (can(staff.role, 'payments')) actions.push(<button key="pay" type="button" className="btn btn-primary" onClick={() => setDialog('pay')}>{t('pay.title')}</button>);
  }

  const facts: [string, React.ReactNode][] = d.kind === 'quote'
    ? [[t('doc.date'), longDate(d.date)], [t('doc.validUntil'), longDate(d.validUntil)], ...(d.acceptedAt ? [[t('doc.acceptedOn'), t('doc.acceptedBy', { date: longDate(d.acceptedAt), name: d.signedBy })] as [string, string]] : [])]
    : [[t('doc.issuedOn'), d.number ? longDate(d.date) : t('docs.notIssued')], [t('doc.due'), longDate(d.due)],
      ...(d.paidAt ? [[t('doc.paidOn'), `${longDate(d.paidAt)} (${t(`pay.${d.payMethod || 'transfer'}` as Key).toLowerCase()})`] as [string, string]] : []),
      ...(linked ? [[t('doc.fromQuote'), <Link key="q" to={docPath(linked)}>{linked.number}</Link>] as [string, React.ReactNode]] : [])];

  return (
    <>
      <Link className="back" to={listPath(d.kind)}>← {t(d.kind === 'quote' ? 'nav.quotes' : 'nav.invoices')}</Link>
      <PageHead title={docName(d)} sub={d.subject}><StatusChip doc={d} /></PageHead>
      <div className="actions-bar">{actions}</div>
      <div className="doc-grid">
        <div className="stack">
          <section className="card">
            <dl className="facts">
              <div><dt>{t('doc.client')}</dt><dd>{client ? <><Link to={`/clients/${client.id}`}>{client.name}</Link><br /><span className="muted small">{client.address}, {client.zip} {client.city}</span></> : '—'}</dd></div>
              {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
          <section className="card">
            <h2 className="card-title">{t('doc.detail')}</h2>
            <LinesTable lines={d.lines} />
            <TotalsBox totals={tt} />
            {d.notes ? <p className="muted small notes">{d.notes}</p> : null}
            <p className="muted small">{t('doc.amountDue', { amount: money(tt.ttc) })}</p>
          </section>
          {d.kind === 'quote' && d.fingerprint ? <Proof quote={d} time={time(d.acceptedAt)} /> : null}
        </div>
        <HistoryCard doc={d} />
      </div>
      {dialog === 'pay' ? <PaymentDialog id={d.id} staff={staff} onClose={() => setDialog(null)} /> : null}
      {dialog === 'remind' ? <ReminderDialog id={d.id} staff={staff} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

/** The acceptance proof, recomputed on display: a quote edited after signature shows as tampered. */
function Proof({ quote, time }: { quote: Quote; time: string }) {
  const { t, longDate } = useFormat();
  const [state, setState] = useState<'checking' | 'valid' | 'tampered' | 'none'>('checking');
  useEffect(() => {
    let live = true;
    void verifyProof(quote).then((r) => { if (live) setState(r); });
    return () => { live = false; };
  }, [quote]);
  return (
    <section className={`card proof proof-${state}`} aria-labelledby="proof-t">
      <h2 id="proof-t" className="card-title">{t('proof.title')}</h2>
      <p className="small">{t('proof.signed', { date: longDate(quote.acceptedAt), time, name: quote.signedBy })}</p>
      {quote.fingerprint ? <><p className="small muted">{t('proof.what')}</p><code className="hash">{quote.fingerprint}</code></> : null}
      <p className="proof-status" role="status">{t(`proof.${state}` as Key)}</p>
    </section>
  );
}

// ---------- draft editor ----------
interface EditLine { key: string; label: string; qty: string; unit: Unit; price: string; vat: VatRate }
const decimal = (n: number) => String(n).replace('.', ','); // French decimals in the fields; parseNum reads both
const editPrice = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const toEdit = (l: Line): EditLine => ({ key: randomId('l', 6), label: l.label, qty: decimal(l.qty), unit: l.unit, price: editPrice(l.price), vat: l.vat });
const parseNum = (s: string) => Number(s.replace(',', '.').replace(/\s/g, ''));
const toLine = (e: EditLine): Line => ({ label: clean(e.label, 200), qty: Math.round(parseNum(e.qty) * 100) / 100, unit: e.unit, price: Math.round(parseNum(e.price) * 100), vat: e.vat });

function Editor({ doc: d, staff }: { doc: Doc; staff: StaffAccount }) {
  const { t, money, docName } = useFormat();
  usePage(`${docName(d)} · Morel Agencement`);
  const { confirm, toast } = useFeedback();
  const clients = useBooks((s) => s.clients);
  const [client, setClient] = useState(d.client);
  const [subject, setSubject] = useState(d.subject);
  const [notes, setNotes] = useState(d.notes);
  const [lines, setLines] = useState<EditLine[]>(() => d.lines.map(toEdit));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; line?: number }>({});
  const isQuote = d.kind === 'quote';
  const touch = () => setDirty(true);
  const defaultVat = (): VatRate => (clients.find((c) => c.id === client)?.type === 'part' ? 10 : 20);
  const valid = lines.map(toLine).filter((l) => lineSchema.safeParse(l).success);
  const live = totals(valid);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const save = (silent: boolean): boolean => {
    const out = lines.map(toLine);
    const bad = out.findIndex((l) => !lineSchema.safeParse(l).success);
    const subj = clean(subject, 120);
    if (!out.length) { toast(t('editor.noLine'), 'err'); return false; }
    if (bad >= 0) { flushSync(() => setErrors({ line: bad })); toast(t('editor.badLine', { n: bad + 1 }), 'err'); document.getElementById(`line-${lines[bad]?.key ?? ''}`)?.focus(); return false; }
    if (subj.length < 3) { flushSync(() => setErrors({ subject: t('editor.subjectRequired') })); document.querySelector<HTMLElement>('.doc-grid input[aria-invalid="true"]')?.focus(); return false; }
    setErrors({});
    const error = saveDraft(d.id, { client, subject: subj, notes: clean(notes, 600, true), lines: out }, staff);
    if (error) { toast(t(`err.${error}` as Key), 'err'); return false; }
    setDirty(false);
    if (!silent) toast(t('editor.saved'));
    return true;
  };
  // leaving the editor keeps the work (like an autosave), as long as it is valid
  const saveRef = useRef(save);
  const dirtyRef = useRef(dirty);
  useEffect(() => { saveRef.current = save; dirtyRef.current = dirty; });
  useEffect(() => () => { if (dirtyRef.current) saveRef.current(true); }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const primary = async () => {
    if (!save(true)) return;
    const total = money(live.ttc);
    if (isQuote) {
      if (!(await confirm({ title: t('editor.sendTitle'), body: t('editor.sendBody', { total }), ok: t('editor.sendOk'), cancel: t('common.cancel') }))) return;
      const error = sendQuote(d.id, staff);
      toast(error ? t(`err.${error}` as Key) : t('editor.sent'), error ? 'err' : 'ok');
    } else {
      if (!(await confirm({ title: t('editor.issueTitle'), body: t('editor.issueBody', { total }), ok: t('editor.issueOk'), cancel: t('common.cancel') }))) return;
      const error = issueInvoice(d.id, staff);
      toast(error ? t(`err.${error}` as Key) : t('editor.issued'), error ? 'err' : 'ok');
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: t('editor.deleteTitle'), ok: t('common.delete'), cancel: t('common.cancel'), danger: true }))) return;
    setDirty(false);
    dirtyRef.current = false;
    const error = deleteDraft(d.id, staff);
    if (error) { toast(t(`err.${error}` as Key), 'err'); return; }
    toast(t('editor.deleted'));
    navigate(listPath(d.kind));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = lines.findIndex((l) => l.key === e.active.id);
    const to = lines.findIndex((l) => l.key === e.over?.id);
    setLines(arrayMove(lines, from, to));
    touch();
  };
  const position = (id: unknown) => lines.findIndex((l) => l.key === id) + 1;

  return (
    <>
      <Link className="back" to={listPath(d.kind)}>← {t(isQuote ? 'nav.quotes' : 'nav.invoices')}</Link>
      <PageHead title={t(isQuote ? 'editor.newQuote' : 'editor.newInvoice')}><StatusChip doc={d} /></PageHead>
      <div className="actions-bar">
        <button type="button" className="btn btn-ghost" onClick={() => save(false)}>{t('editor.save')}</button>
        <button type="button" className="btn btn-primary" onClick={() => void primary()}>{t(isQuote ? 'editor.send' : 'editor.issue')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { if (save(true)) downloadPdf({ ...d, client, subject: clean(subject, 120), notes, lines: lines.map(toLine) }); }}>{t('editor.preview')}</button>
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>{t('common.delete')}</button>
        <span className="muted small" aria-live="polite">{dirty ? t('editor.unsaved') : t('editor.upToDate')}</span>
      </div>
      <div className="doc-grid">
        <div className="stack">
          <section className="card form">
            <div className="row2">
              <div className="field">
                <Select label={t('doc.client')} value={client} onChange={(e) => { setClient(e.target.value); touch(); }}>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.type === 'part' ? ` (${t('clients.part').toLowerCase()})` : ''}</option>)}
                </Select>
                <Link className="small" to="/clients?nouveau=1">{t('clients.new')}</Link>
              </div>
              <Field label={t('editor.subject')} maxLength={120} placeholder={t('editor.subjectPh')} value={subject} onChange={(e) => { setSubject(e.target.value); touch(); }} error={errors.subject} />
            </div>
          </section>
          <section className="card">
            <h2 className="card-title">{t('editor.lines')}</h2>
            <p className="muted small">{t('editor.linesHint')}</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
              accessibility={{
                screenReaderInstructions: { draggable: t('editor.dragHelp') },
                announcements: {
                  onDragStart: ({ active }) => t('editor.picked', { n: position(active.id) }),
                  onDragOver: ({ over }) => (over ? t('editor.over', { n: position(over.id) }) : ''),
                  onDragEnd: ({ over }) => (over ? t('editor.dropped', { n: position(over.id) }) : ''),
                  onDragCancel: () => t('editor.dragCancel'),
                },
              }}>
              <SortableContext items={lines.map((l) => l.key)} strategy={verticalListSortingStrategy}>
                <ol className="line-editor">
                  {lines.map((l, i) => (
                    <LineRow key={l.key} line={l} index={i} invalid={errors.line === i}
                      onChange={(patch) => { setLines(lines.map((x) => (x.key === l.key ? { ...x, ...patch } : x))); touch(); }}
                      onRemove={() => { setLines(lines.filter((x) => x.key !== l.key)); touch(); }} />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            <div className="le-add">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const key = randomId('l', 6); setLines([...lines, { key, label: '', qty: '1', unit: 'u', price: '0,00', vat: defaultVat() }]); touch(); requestAnimationFrame(() => document.getElementById(`line-${key}`)?.focus()); }}>{t('editor.addLine')}</button>
              <select aria-label={t('editor.fromCatalog')} value="" onChange={(e) => {
                const c = CATALOG[Number(e.target.value)];
                if (!c) return;
                setLines([...lines, { key: randomId('l', 6), label: c.label, qty: '1', unit: c.unit, price: editPrice(c.price), vat: defaultVat() }]);
                touch();
              }}>
                <option value="">{t('editor.fromCatalog')}</option>
                {CATALOG.map((c, i) => <option key={c.label} value={i}>{c.label} · {money(c.price)} / {c.unit}</option>)}
              </select>
            </div>
            <TotalsBox totals={live} />
          </section>
          <section className="card form">
            <TextArea label={t('editor.notes')} rows={3} maxLength={600} placeholder={t('editor.notesPh')} value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} />
            <p className="muted small">{t(isQuote ? 'editor.quoteRule' : 'editor.invoiceRule')}</p>
          </section>
        </div>
        <HistoryCard doc={d} />
      </div>
    </>
  );
}

function LineRow({ line, index, invalid, onChange, onRemove }: { line: EditLine; index: number; invalid: boolean; onChange: (p: Partial<EditLine>) => void; onRemove: () => void }) {
  const { t, money } = useFormat();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: line.key });
  const n = index + 1;
  const total = lineTotal({ qty: Math.round(parseNum(line.qty) * 100) / 100, price: Math.round(parseNum(line.price) * 100) });
  return (
    <li ref={setNodeRef} className={`le-row ${isDragging ? 'is-dragging' : ''} ${invalid ? 'is-invalid' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="le-handle" aria-label={t('editor.dragLine', { n })} {...attributes} {...listeners} aria-roledescription={t('editor.sortable')}>⠿</button>
      <textarea id={`line-${line.key}`} rows={1} maxLength={200} aria-label={t('editor.lineLabel', { n })} aria-invalid={invalid || undefined} value={line.label} onChange={(e) => onChange({ label: e.target.value })} />
      <div className="le-nums">
        <input className="num" inputMode="decimal" aria-label={t('editor.lineQty', { n })} value={line.qty} onChange={(e) => onChange({ qty: e.target.value })} />
        <select aria-label={t('editor.lineUnit', { n })} value={line.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <input className="num" inputMode="decimal" aria-label={t('editor.linePrice', { n })} value={line.price} onChange={(e) => onChange({ price: e.target.value })} />
        <select aria-label={t('editor.lineVat', { n })} value={line.vat} onChange={(e) => onChange({ vat: Number(e.target.value) as VatRate })}>{VAT_RATES.map((v) => <option key={v} value={v}>{String(v).replace('.', ',')} %</option>)}</select>
        <span className="le-total num">{Number.isFinite(total) ? money(total) : '—'}</span>
      </div>
      <button type="button" className="icon-btn danger" aria-label={t('editor.removeLine', { n })} onClick={onRemove}>✕</button>
    </li>
  );
}
