import { useState, type FormEvent } from 'react';
import { COMPANY, PAY_METHODS, type PayMethod, type StaffAccount } from '../domain/catalog';
import { daysBetween, isoDate, totals } from '../domain/rules';
import type { Client, Invoice } from '../domain/schema';
import { useFormat } from '../format';
import type { Key } from '../i18n';
import { recordPayment, remind, useBooks } from '../state/app';
import { clean } from '../shared/security';
import { Dialog } from '../shared/ui/Dialog';
import { useFeedback } from '../shared/ui/Feedback';
import { Field, Select, TextArea } from '../shared/ui/Field';

/** The letter the client receives stays in French: the clients are French. */
export function reminderText(d: Invoice, c: Client, today: string): string {
  const fmt = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totals(d.lines).ttc / 100);
  const late = Math.max(0, daysBetween(d.due, today));
  const hello = c.type === 'pro' ? `Bonjour ${c.contact},` : `Bonjour ${c.contact.split(' ')[0] ?? c.contact},`;
  return [
    hello, '',
    `Sauf erreur de notre part, la facture ${d.number} du ${fmt(d.date)}, d’un montant de ${euro} TTC, arrivée à échéance le ${fmt(d.due)}, n’a pas encore été réglée${late ? ` (${late} jours de retard)` : ''}.`, '',
    `Vous pouvez la consulter et la régler depuis votre espace client, ou par virement sur le compte ${COMPANY.iban}.`, '',
    'Si le règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message.', '',
    'Bien cordialement,', 'Antoine Morel', `${COMPANY.name} · ${COMPANY.phone}`,
  ].join('\n');
}

export function ReminderDialog({ id, staff, onClose }: { id: string; staff: StaffAccount; onClose: () => void }) {
  const { t } = useFormat();
  const { toast } = useFeedback();
  const doc = useBooks((s) => s.docs.find((d) => d.id === id));
  const client = useBooks((s) => s.clients.find((c) => c.id === doc?.client));
  const [text, setText] = useState(() => (doc?.kind === 'invoice' && client ? reminderText(doc, client, isoDate(new Date())) : ''));
  const [status, setStatus] = useState<string | null>(null);
  if (!doc || doc.kind !== 'invoice' || !client) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(clean(text, 2000, true)); setStatus(t('remind.copied')); } catch { setStatus(t('remind.copyBlocked')); }
  };
  const mark = () => {
    const error = remind(id, staff);
    toast(error ? t(`err.${error}` as Key) : t('remind.done'), error ? 'err' : 'ok');
    if (!error) onClose();
  };
  return (
    <Dialog open onClose={onClose} title={t('remind.title', { number: doc.number })} wide>
      <div className="form">
        <TextArea label={t('remind.label')} rows={12} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="muted" aria-live="polite">{status ?? (doc.reminders ? t('remind.already', { n: doc.reminders }) : t('remind.first'))}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>{t('remind.copy')}</button>
          <button type="button" className="btn btn-primary" onClick={mark}>{t('remind.mark')}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function PaymentDialog({ id, staff, onClose }: { id: string; staff: StaffAccount; onClose: () => void }) {
  const { t, money, longDate } = useFormat();
  const { toast } = useFeedback();
  const doc = useBooks((s) => s.docs.find((d) => d.id === id));
  const today = isoDate(new Date());
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PayMethod>('transfer');
  const [error, setError] = useState<string | null>(null);
  if (!doc || doc.kind !== 'invoice') return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = recordPayment(id, date, method, staff);
    if (result === 'invalid') { setError(t('pay.dateRange', { from: longDate(doc.date) })); return; }
    if (result) { toast(t(`err.${result}` as Key), 'err'); return; }
    toast(t('pay.recorded'));
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={t('pay.title')}>
      <form className="form" noValidate onSubmit={submit}>
        <p className="muted">{doc.number} · {money(totals(doc.lines).ttc)} {t('totals.ttcShort')}</p>
        <div className="row2">
          <Field label={t('pay.date')} type="date" value={date} min={doc.date} max={today} onChange={(e) => setDate(e.target.value)} error={error} />
          <Select label={t('pay.method')} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{t(`pay.${m}`)}</option>)}
          </Select>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary">{t('pay.submit')}</button>
        </div>
      </form>
    </Dialog>
  );
}
