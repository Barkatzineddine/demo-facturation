// Lays out a quote or an invoice on A4 pages with the French mandatory mentions. The documents stay in
// French whatever the interface language: they are French legal documents.
import { COMPANY } from '../domain/catalog';
import { lineTotal, totals } from '../domain/rules';
import type { Client, Doc } from '../domain/schema';
import { A4, PdfDoc, textWidth, wrap } from './writer';

const INK = '#1f2430';
const MUTED = '#5d6474';
const ACCENT = '#0f5f58';
const LINE = '#d9dde4';
const M = 48; // page margin
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const money = (cents: number) => euro.format(cents / 100);
const qtyFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const longDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
};
const METHOD: Record<string, string> = { transfer: 'virement', card: 'carte bancaire', cheque: 'chèque', cash: 'espèces' };

export function buildPdf(doc: Doc, client: Client, quoteNumber = '', now = new Date()): Uint8Array {
  const isQuote = doc.kind === 'quote';
  const t = totals(doc.lines);
  const title = isQuote ? 'DEVIS' : 'FACTURE';
  const number = doc.number || 'Brouillon';
  const pdf = new PdfDoc({ title: `${title} ${number} · ${COMPANY.name}`, author: COMPANY.name });
  let y = 0;
  let page = 1;

  const cols = [
    { title: 'Désignation', x: M, align: 'left' as const },
    { title: 'Qté', x: M + 300, align: 'right' as const },
    { title: 'Unité', x: M + 308, align: 'left' as const },
    { title: 'PU HT', x: M + 410, align: 'right' as const },
    { title: 'TVA', x: M + 442, align: 'right' as const },
    { title: 'Total HT', x: A4.w - M, align: 'right' as const },
  ];
  const col = (i: number) => (cols[i] as (typeof cols)[number]).x;

  const watermark = () => pdf.text(doc.status === 'draft' ? 'BROUILLON' : 'DÉMO', A4.w / 2 - 150, A4.h / 2 + 120, { size: 90, bold: true, color: '#f1f2f5', angle: 35 });
  const footer = () => {
    const lines = [
      `${COMPANY.name} · ${COMPANY.legal} · SIRET ${COMPANY.siret} · TVA ${COMPANY.vat} · ${COMPANY.rcs}`,
      'Document généré par une démonstration : entreprise, clients et montants fictifs, sans valeur juridique.',
    ];
    pdf.line(M, A4.h - 52, A4.w - M, A4.h - 52, { color: LINE });
    lines.forEach((l, i) => pdf.text(l, M, A4.h - 38 + i * 11, { size: 7.5, color: MUTED }));
    pdf.text(`Page ${page}`, A4.w - M, A4.h - 27, { size: 7.5, color: MUTED, align: 'right' });
  };
  const tableHeader = () => {
    pdf.rect(M, y, A4.w - 2 * M, 22, { fill: '#eef1f4' });
    for (const c of cols) pdf.text(c.title, c.x + (c.align === 'right' ? -4 : 6), y + 14.5, { size: 8.5, bold: true, color: MUTED, align: c.align });
    y += 30;
  };
  const newPage = () => {
    footer();
    pdf.addPage();
    page += 1;
    watermark();
    y = M;
    pdf.text(`${title} ${number} (suite)`, M, y, { size: 10, bold: true, color: MUTED });
    y += 20;
    tableHeader();
  };
  const ensure = (space: number) => { if (y + space > A4.h - 80) newPage(); };

  // ---------- header ----------
  watermark();
  pdf.rect(0, 0, A4.w, 6, { fill: ACCENT });
  y = 56;
  pdf.text(COMPANY.name, M, y, { size: 18, bold: true, color: INK });
  [COMPANY.activity, COMPANY.address, `${COMPANY.zip} ${COMPANY.city}`, `${COMPANY.phone} · ${COMPANY.email}`]
    .forEach((l, i) => pdf.text(l, M, y + 16 + i * 12, { size: 9, color: MUTED }));
  pdf.text(title, A4.w - M, y, { size: 24, bold: true, color: ACCENT, align: 'right' });
  const meta = doc.kind === 'quote'
    ? [['Numéro', number], ['Date', longDate(doc.date)], ['Valable jusqu’au', longDate(doc.validUntil)]]
    : [['Numéro', number], ['Date d’émission', longDate(doc.date)], ['Échéance', longDate(doc.due)]];
  meta.forEach(([k, v], i) => {
    pdf.text(k ?? '', A4.w - M - 120, y + 20 + i * 13, { size: 9, color: MUTED, align: 'right' });
    pdf.text(v ?? '', A4.w - M, y + 20 + i * 13, { size: 9, bold: true, color: INK, align: 'right' });
  });

  // ---------- client block and subject ----------
  y = 150;
  const bx = A4.w / 2 + 10;
  const clientLines = [client.name, client.type === 'pro' && client.contact !== client.name ? `À l’attention de ${client.contact}` : null,
    client.address, `${client.zip} ${client.city}`, client.siret ? `SIRET ${client.siret}` : null].filter((l): l is string => !!l);
  const bh = 26 + clientLines.length * 12;
  pdf.rect(bx, y, A4.w - M - bx, bh, { fill: '#f7f8fa', stroke: LINE });
  pdf.text(isQuote ? 'CLIENT' : 'FACTURÉ À', bx + 12, y + 16, { size: 7.5, bold: true, color: MUTED });
  clientLines.forEach((l, i) => pdf.text(l, bx + 12, y + 30 + i * 12, { size: i === 0 ? 10 : 9, bold: i === 0, color: INK }));
  pdf.text('Objet', M, y + 16, { size: 7.5, bold: true, color: MUTED });
  wrap(doc.subject || 'Travaux de menuiserie', 10, A4.w / 2 - M - 20, true).slice(0, 2)
    .forEach((l, i) => pdf.text(l, M, y + 30 + i * 13, { size: 10, bold: true, color: INK }));
  if (!isQuote && quoteNumber) pdf.text(`Selon devis ${quoteNumber} accepté`, M, y + 60, { size: 9, color: MUTED });
  y += bh + 26;

  // ---------- lines ----------
  tableHeader();
  for (const l of doc.lines) {
    const labelLines = wrap(l.label, 9.5, 230);
    const rowH = Math.max(1, labelLines.length) * 12 + 10;
    ensure(rowH);
    labelLines.forEach((t2, i) => pdf.text(t2, M + 6, y + 4 + i * 12, { size: 9.5, color: INK }));
    pdf.text(qtyFmt.format(l.qty), col(1) - 4, y + 4, { size: 9.5, color: INK, align: 'right' });
    pdf.text(l.unit, col(2) + 6, y + 4, { size: 9.5, color: MUTED });
    pdf.text(money(l.price), col(3) - 4, y + 4, { size: 9.5, color: INK, align: 'right' });
    pdf.text(`${String(l.vat).replace('.', ',')} %`, col(4) - 4, y + 4, { size: 9.5, color: MUTED, align: 'right' });
    pdf.text(money(lineTotal(l)), col(5) - 4, y + 4, { size: 9.5, bold: true, color: INK, align: 'right' });
    y += rowH;
    pdf.line(M, y - 6, A4.w - M, y - 6, { color: LINE, width: 0.5 });
  }

  // ---------- totals ----------
  const rows: [string, string, boolean][] = [
    ['Total HT', money(t.ht), false],
    ...t.vats.map((v): [string, string, boolean] => [`TVA ${String(v.rate).replace('.', ',')} % sur ${money(v.base)}`, money(v.amount), false]),
    [isQuote ? 'Total TTC' : 'Net à payer TTC', money(t.ttc), true],
  ];
  ensure(rows.length * 16 + 30);
  y += 8;
  const tx = A4.w - M - 230;
  for (const [k, v, strong] of rows) {
    if (strong) pdf.rect(tx, y - 4, 230, 24, { fill: ACCENT });
    pdf.text(k, tx + 10, y + 11, { size: strong ? 11 : 9.5, bold: strong, color: strong ? '#ffffff' : MUTED });
    pdf.text(v, A4.w - M - 8, y + 11, { size: strong ? 11 : 9.5, bold: true, color: strong ? '#ffffff' : INK, align: 'right' });
    y += strong ? 28 : 17;
  }

  // ---------- notes, conditions, signature ----------
  const conditions = doc.kind === 'quote'
    ? ['Devis valable 30 jours. Acompte de 30 % à la commande, solde à la réception des travaux.',
      'Délai d’intervention indicatif : 3 à 5 semaines après acceptation.']
    : [`Paiement à réception, au plus tard le ${longDate(doc.due)}, par virement : IBAN ${COMPANY.iban} · BIC ${COMPANY.bic} (fictifs).`,
      'Pénalités de retard : trois fois le taux d’intérêt légal. Pas d’escompte pour paiement anticipé.',
      client.type === 'pro' ? 'Indemnité forfaitaire pour frais de recouvrement : 40 € (art. L441-10 du Code de commerce).' : null].filter((c): c is string => !!c);
  const notes = doc.notes ? wrap(doc.notes, 8.5, A4.w - 2 * M) : [];
  const condLines = conditions.flatMap((c) => wrap(c, 8.5, A4.w - 2 * M));
  ensure((notes.length + condLines.length) * 11 + (isQuote ? 110 : 40));
  y += 10;
  for (const l of [...notes, ...condLines]) { pdf.text(l, M, y, { size: 8.5, color: MUTED }); y += 11; }

  if (doc.kind === 'quote') {
    y += 12;
    const sw = 250;
    pdf.rect(A4.w - M - sw, y, sw, 76, { stroke: LINE });
    pdf.text('Bon pour accord', A4.w - M - sw + 12, y + 16, { size: 9, bold: true, color: INK });
    if (doc.acceptedAt) {
      pdf.text(`Accepté le ${longDate(doc.acceptedAt)}`, A4.w - M - sw + 12, y + 34, { size: 9, color: INK });
      pdf.text(`par ${doc.signedBy}`, A4.w - M - sw + 12, y + 47, { size: 9, bold: true, color: INK });
      if (doc.fingerprint) pdf.text(`Empreinte SHA-256 : ${doc.fingerprint.slice(0, 32)}…`, A4.w - M - sw + 12, y + 62, { size: 6.5, color: MUTED });
    } else {
      pdf.text('Date, nom et signature du client :', A4.w - M - sw + 12, y + 34, { size: 8.5, color: MUTED });
    }
  } else if (doc.status === 'paid') {
    y += 10;
    const label = `PAYÉE le ${longDate(doc.paidAt)} (${METHOD[doc.payMethod] ?? 'virement'})`;
    const w = textWidth(label, 11, true) + 24;
    pdf.rect(M, y, w, 24, { stroke: '#1e7a3c', width: 1.5 });
    pdf.text(label, M + 12, y + 16, { size: 11, bold: true, color: '#1e7a3c' });
  }

  footer();
  return pdf.output(now);
}

export const pdfFileName = (doc: Doc, client: Client) => `${doc.kind === 'quote' ? 'devis' : 'facture'}-${doc.number || 'brouillon'}-${client.name}`
  .toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pdf';
