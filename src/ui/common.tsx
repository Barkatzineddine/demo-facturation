// Shared pieces: status chip, page header, line and total tables, history, PDF download.
import type { ReactNode } from 'react';
import { isoDate, lineTotal, statusOf, type Totals } from '../domain/rules';
import type { Doc, Line } from '../domain/schema';
import { useFormat } from '../format';
import { buildPdf, pdfFileName } from '../pdf/layout';
import { app } from '../state/app';
import { download } from '../shared/security';

// status -> tone and icon. The icon and the word carry the meaning, never the colour alone.
const TONES: Record<string, [string, string]> = {
  draft: ['neutral', '✎'], sent: ['info', '➜'], accepted: ['good', '✓'], refused: ['bad', '✕'], expired: ['warn', '⌛'],
  issued: ['info', '●'], late: ['bad', '!'], paid: ['good', '✓'],
};

export function StatusChip({ doc }: { doc: Doc }) {
  const { status } = useFormat();
  const [tone, icon] = TONES[statusOf(doc, isoDate(new Date()))] ?? ['neutral', '•'];
  return <span className={`chip tone-${tone}`}><span className="chip-ic" aria-hidden="true">{icon}</span>{status(doc)}</span>;
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div><h1 tabIndex={-1}>{title}</h1>{sub ? <p className="muted">{sub}</p> : null}</div>
      {children ? <div className="head-actions">{children}</div> : null}
    </header>
  );
}

export function LinesTable({ lines }: { lines: readonly Line[] }) {
  const { t, money, qty } = useFormat();
  return (
    // scrolls sideways on phones: focusable and labelled so keyboard users can scroll it too
    <div className="table-scroll" tabIndex={0} role="region" aria-label={t('lines.region')}>
      <table className="table lines">
        <thead><tr><th scope="col">{t('lines.label')}</th><th scope="col" className="num">{t('lines.qty')}</th><th scope="col" className="num">{t('lines.price')}</th><th scope="col" className="num">{t('lines.vat')}</th><th scope="col" className="num">{t('lines.total')}</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.label}</td>
              <td className="num">{qty(l.qty)} {l.unit}</td>
              <td className="num">{money(l.price)}</td>
              <td className="num">{String(l.vat).replace('.', ',')} %</td>
              <td className="num strong">{money(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsBox({ totals }: { totals: Totals }) {
  const { t, money } = useFormat();
  return (
    <dl className="totals">
      <div><dt>{t('totals.ht')}</dt><dd className="num">{money(totals.ht)}</dd></div>
      {totals.vats.map((v) => <div key={v.rate}><dt>{t('totals.vatRate', { rate: String(v.rate).replace('.', ',') })}</dt><dd className="num">{money(v.amount)}</dd></div>)}
      <div className="grand"><dt>{t('totals.ttc')}</dt><dd className="num">{money(totals.ttc)}</dd></div>
    </dl>
  );
}

export function HistoryCard({ doc }: { doc: Doc }) {
  const { t, shortDate, time, history } = useFormat();
  return (
    <aside className="card history" aria-labelledby="hist-t">
      <h2 id="hist-t" className="card-title">{t('history.title')}</h2>
      <ol className="timeline">
        {[...doc.history].reverse().map((h, i) => (
          <li key={i}><span className="muted small">{shortDate(h.at)}{time(h.at) ? ` · ${time(h.at)}` : ''}</span><span>{history(h)}</span></li>
        ))}
      </ol>
    </aside>
  );
}

/** Builds the PDF in the browser and saves it: the document never leaves the device. */
export function downloadPdf(doc: Doc): void {
  const state = app.get();
  const client = state.clients.find((c) => c.id === doc.client);
  if (!client) return;
  const quote = doc.kind === 'invoice' && doc.quote ? state.docs.find((d) => d.id === doc.quote)?.number ?? '' : '';
  download(pdfFileName(doc, client), buildPdf(doc, client, quote), 'application/pdf');
}

export const docPath = (d: Pick<Doc, 'kind' | 'id'>) => `/${d.kind === 'quote' ? 'devis' : 'factures'}/${d.id}`;
