// Lays out a quote or an invoice on A4 pages with the French mandatory mentions.
import { PdfDoc, A4, wrap, textWidth } from './pdf.js';
import { COMPANY, totals, lineTotal } from './data.js';
import { download, fmtDay } from './core.js';

const INK = '#1f2430';
const MUTED = '#5d6474';
const ACCENT = '#0f5f58';
const LINE = '#d9dde4';
const M = 48; // page margin
const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const qtyFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const longDate = (iso) => fmtDay(iso.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' });

export function buildPdf(doc, client) {
  const isQuote = doc.kind === 'devis';
  const t = totals(doc);
  const title = isQuote ? 'DEVIS' : 'FACTURE';
  const number = doc.number || 'Brouillon';
  const pdf = new PdfDoc({ title: `${title} ${number} · ${COMPANY.name}`, author: COMPANY.name });
  let y = 0;
  let page = 1;

  const cols = [
    { key: 'label', title: 'Désignation', x: M, w: 230, align: 'left' },
    { key: 'qty', title: 'Qté', x: M + 300, align: 'right' },
    { key: 'unit', title: 'Unité', x: M + 308, align: 'left' },
    { key: 'price', title: 'PU HT', x: M + 410, align: 'right' },
    { key: 'vat', title: 'TVA', x: M + 442, align: 'right' },
    { key: 'total', title: 'Total HT', x: A4.w - M, align: 'right' },
  ];

  function watermark() {
    pdf.text(doc.status === 'brouillon' ? 'BROUILLON' : 'DÉMO', A4.w / 2 - 150, A4.h / 2 + 120, { size: 90, bold: true, color: '#f1f2f5', angle: 35 });
  }

  function footer() {
    const lines = [
      `${COMPANY.name} · ${COMPANY.legal} · SIRET ${COMPANY.siret} · TVA ${COMPANY.vat} · ${COMPANY.rcs}`,
      'Document généré par une démonstration : entreprise, clients et montants fictifs, sans valeur juridique.',
    ];
    pdf.line(M, A4.h - 52, A4.w - M, A4.h - 52, { color: LINE });
    lines.forEach((l, i) => pdf.text(l, M, A4.h - 38 + i * 11, { size: 7.5, color: MUTED }));
    pdf.text(`Page ${page}`, A4.w - M, A4.h - 27, { size: 7.5, color: MUTED, align: 'right' });
  }

  function tableHeader() {
    pdf.rect(M, y, A4.w - 2 * M, 22, { fill: '#eef1f4' });
    for (const c of cols) pdf.text(c.title, c.x + (c.align === 'right' ? -4 : 6), y + 14.5, { size: 8.5, bold: true, color: MUTED, align: c.align });
    y += 30;
  }

  function newPage() {
    footer();
    pdf.addPage();
    page += 1;
    watermark();
    y = M;
    pdf.text(`${title} ${number} (suite)`, M, y, { size: 10, bold: true, color: MUTED });
    y += 20;
    tableHeader();
  }

  function ensure(space) { if (y + space > A4.h - 80) newPage(); }

  // ---------- Header ----------
  watermark();
  pdf.rect(0, 0, A4.w, 6, { fill: ACCENT });
  y = 56;
  pdf.text(COMPANY.name, M, y, { size: 18, bold: true, color: INK });
  [COMPANY.activity, COMPANY.address, `${COMPANY.zip} ${COMPANY.city}`, `${COMPANY.phone} · ${COMPANY.email}`]
    .forEach((l, i) => pdf.text(l, M, y + 16 + i * 12, { size: 9, color: MUTED }));
  pdf.text(title, A4.w - M, y, { size: 24, bold: true, color: ACCENT, align: 'right' });
  const meta = isQuote
    ? [['Numéro', number], ['Date', longDate(doc.date)], ['Valable jusqu’au', longDate(doc.validUntil)]]
    : [['Numéro', number], ['Date d’émission', longDate(doc.date)], ['Échéance', longDate(doc.due)]];
  meta.forEach(([k, v], i) => {
    pdf.text(k, A4.w - M - 120, y + 20 + i * 13, { size: 9, color: MUTED, align: 'right' });
    pdf.text(v, A4.w - M, y + 20 + i * 13, { size: 9, bold: true, color: INK, align: 'right' });
  });

  // ---------- Client block ----------
  y = 150;
  const bx = A4.w / 2 + 10;
  const clientLines = [client.name, client.type === 'pro' && client.contact !== client.name ? `À l’attention de ${client.contact}` : null,
    client.address, `${client.zip} ${client.city}`, client.siret ? `SIRET ${client.siret}` : null].filter(Boolean);
  const bh = 26 + clientLines.length * 12;
  pdf.rect(bx, y, A4.w - M - bx, bh, { fill: '#f7f8fa', stroke: LINE });
  pdf.text(isQuote ? 'CLIENT' : 'FACTURÉ À', bx + 12, y + 16, { size: 7.5, bold: true, color: MUTED });
  clientLines.forEach((l, i) => pdf.text(l, bx + 12, y + 30 + i * 12, { size: i === 0 ? 10 : 9, bold: i === 0, color: INK }));
  if (isQuote) {
    pdf.text('Objet', M, y + 16, { size: 7.5, bold: true, color: MUTED });
    wrap(doc.subject || 'Travaux de menuiserie', 10, A4.w / 2 - M - 20, true).slice(0, 2)
      .forEach((l, i) => pdf.text(l, M, y + 30 + i * 13, { size: 10, bold: true, color: INK }));
  } else {
    pdf.text('Objet', M, y + 16, { size: 7.5, bold: true, color: MUTED });
    wrap(doc.subject || 'Travaux de menuiserie', 10, A4.w / 2 - M - 20, true).slice(0, 2)
      .forEach((l, i) => pdf.text(l, M, y + 30 + i * 13, { size: 10, bold: true, color: INK }));
    if (doc.quoteNumber) pdf.text(`Selon devis ${doc.quoteNumber} accepté`, M, y + 60, { size: 9, color: MUTED });
  }
  y += bh + 26;

  // ---------- Lines ----------
  tableHeader();
  for (const l of doc.lines) {
    const labelLines = wrap(l.label, 9.5, cols[0].w);
    const rowH = Math.max(1, labelLines.length) * 12 + 10;
    ensure(rowH);
    labelLines.forEach((t2, i) => pdf.text(t2, M + 6, y + 4 + i * 12, { size: 9.5, color: INK }));
    pdf.text(qtyFmt.format(l.qty), cols[1].x - 4, y + 4, { size: 9.5, color: INK, align: 'right' });
    pdf.text(l.unit, cols[2].x + 6, y + 4, { size: 9.5, color: MUTED });
    pdf.text(money.format(l.price), cols[3].x - 4, y + 4, { size: 9.5, color: INK, align: 'right' });
    pdf.text(`${String(l.vat).replace('.', ',')} %`, cols[4].x - 4, y + 4, { size: 9.5, color: MUTED, align: 'right' });
    pdf.text(money.format(lineTotal(l)), cols[5].x - 4, y + 4, { size: 9.5, bold: true, color: INK, align: 'right' });
    y += rowH;
    pdf.line(M, y - 6, A4.w - M, y - 6, { color: LINE, width: 0.5 });
  }

  // ---------- Totals ----------
  const rows = [['Total HT', money.format(t.ht), false], ...t.vats.map((v) => [`TVA ${String(v.rate).replace('.', ',')} % sur ${money.format(v.base)}`, money.format(v.amount), false]), [isQuote ? 'Total TTC' : 'Net à payer TTC', money.format(t.ttc), true]];
  ensure(rows.length * 16 + 30);
  y += 8;
  const tx = A4.w - M - 230;
  rows.forEach(([k, v, strong]) => {
    if (strong) { pdf.rect(tx, y - 4, 230, 24, { fill: ACCENT }); }
    pdf.text(k, tx + 10, y + 11, { size: strong ? 11 : 9.5, bold: strong, color: strong ? '#ffffff' : MUTED });
    pdf.text(v, A4.w - M - 8, y + 11, { size: strong ? 11 : 9.5, bold: true, color: strong ? '#ffffff' : INK, align: 'right' });
    y += strong ? 28 : 17;
  });

  // ---------- Notes, conditions, signature ----------
  const conditions = isQuote
    ? ['Devis valable 30 jours. Acompte de 30 % à la commande, solde à la réception des travaux.',
      'Délai d’intervention indicatif : 3 à 5 semaines après acceptation.']
    : [`Paiement à réception, au plus tard le ${longDate(doc.due)}, par virement : IBAN ${COMPANY.iban} · BIC ${COMPANY.bic} (fictifs).`,
      'Pénalités de retard : trois fois le taux d’intérêt légal. Pas d’escompte pour paiement anticipé.',
      client.type === 'pro' ? 'Indemnité forfaitaire pour frais de recouvrement : 40 € (art. L441-10 du Code de commerce).' : null].filter(Boolean);
  const notes = doc.notes ? wrap(doc.notes, 8.5, A4.w - 2 * M) : [];
  const condLines = conditions.flatMap((c) => wrap(c, 8.5, A4.w - 2 * M));
  ensure((notes.length + condLines.length) * 11 + (isQuote ? 110 : 40));
  y += 10;
  [...notes, ...condLines].forEach((l) => { pdf.text(l, M, y, { size: 8.5, color: MUTED }); y += 11; });

  if (isQuote) {
    y += 12;
    const sw = 250;
    pdf.rect(A4.w - M - sw, y, sw, 76, { stroke: LINE });
    pdf.text('Bon pour accord', A4.w - M - sw + 12, y + 16, { size: 9, bold: true, color: INK });
    if (doc.acceptedAt) {
      pdf.text(`Accepté en ligne le ${longDate(doc.acceptedAt)}`, A4.w - M - sw + 12, y + 34, { size: 9, color: INK });
      pdf.text(`par ${doc.signedBy}`, A4.w - M - sw + 12, y + 47, { size: 9, bold: true, color: INK });
      if (doc.fingerprint) pdf.text(`Empreinte SHA-256 : ${doc.fingerprint.slice(0, 32)}…`, A4.w - M - sw + 12, y + 62, { size: 6.5, color: MUTED });
    } else {
      pdf.text('Date, nom et signature du client :', A4.w - M - sw + 12, y + 34, { size: 8.5, color: MUTED });
    }
  } else if (doc.status === 'payée') {
    y += 10;
    const label = `PAYÉE le ${longDate(doc.paidAt)} (${doc.payMethod.toLowerCase()})`;
    const w = textWidth(label, 11, true) + 24;
    pdf.rect(M, y, w, 24, { stroke: '#1e7a3c', width: 1.5 });
    pdf.text(label, M + 12, y + 16, { size: 11, bold: true, color: '#1e7a3c' });
  }

  footer();
  return pdf.output();
}

export function downloadPdf(doc, client) {
  const bytes = buildPdf(doc, client);
  const name = `${doc.kind === 'devis' ? 'devis' : 'facture'}-${doc.number || 'brouillon'}-${client.name}`.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  download(`${name}.pdf`, bytes, 'application/pdf');
}
