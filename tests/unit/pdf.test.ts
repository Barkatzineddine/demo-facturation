// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Client, Invoice, Quote } from '../../src/domain/schema';
import { buildPdf, pdfFileName } from '../../src/pdf/layout';
import { PdfDoc, textWidth, wrap } from '../../src/pdf/writer';

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const client: Client = {
  id: 'c1', token: 'ABCDEFGHJKLMNPQR', type: 'pro', name: 'Bistrot (du) Quai', contact: 'Julien Maréchal', email: 'j@example.com', phone: '06 39 98 11 22',
  address: '3 quai Richelieu', zip: '33000', city: 'Bordeaux', siret: '123 456 789 00012', created: '2025-01-01',
};
const lines = Array.from({ length: 3 }, (_, i) => ({ label: `Ligne ${i + 1} : chêne « massif »`, qty: 2, unit: 'ml' as const, price: 32000, vat: 20 as const }));
const invoice: Invoice = {
  kind: 'invoice', id: 'f1', client: 'c1', number: 'F-2026-0007', date: '2026-10-01', due: '2026-10-31', status: 'paid', subject: 'Agencement', notes: '',
  lines, paidAt: '2026-10-10', payMethod: 'transfer', reminders: 0, history: [],
};

describe('PDF writer', () => {
  it('measures with the Helvetica metrics and wraps on word boundaries', () => {
    expect(textWidth('WWW', 10)).toBeCloseTo(28.32);
    expect(textWidth('iii', 10)).toBeCloseTo(6.66);
    expect(textWidth('Bold', 10, true)).toBeGreaterThan(textWidth('Bold', 10));
    const out = wrap('un deux trois quatre cinq six sept', 10, 60);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join(' ')).toBe('un deux trois quatre cinq six sept');
  });

  it('writes a structurally valid PDF: header, objects at the xref offsets, trailer', () => {
    const doc = new PdfDoc({ title: 'Test (1)' });
    doc.text('Bonjour (monde) \\ € «»', 50, 50).addPage().text('Page 2', 50, 50);
    const raw = latin1(doc.output(new Date(2026, 0, 2, 3, 4)));
    expect(raw.startsWith('%PDF-1.4\n')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    const xref = Number(raw.match(/startxref\n(\d+)/)?.[1]);
    expect(raw.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...raw.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(raw.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(raw).toContain('/Count 2');
    // parentheses and backslashes escaped, euro and guillemets in WinAnsi
    expect(raw).toContain('Bonjour \\(monde\\) \\\\ ');
    expect(raw).toContain(`${String.fromCharCode(128)} ${String.fromCharCode(171)}${String.fromCharCode(187)}`);
    expect(raw).toContain('/Title (Test \\(1\\))');
  });
});

describe('quote and invoice layout', () => {
  it('prints the mandatory mentions of a French invoice to a business', () => {
    const raw = latin1(buildPdf(invoice, client, 'D-2026-0004'));
    for (const text of ['FACTURE', 'F-2026-0007', 'Selon devis D-2026-0004', 'Net à payer TTC', 'Pénalités de retard', 'frais de recouvrement : 40', 'SIRET 123 456 789 00012', 'PAYÉE le']) {
      const winAnsi = Array.from(text, (c) => String.fromCharCode(c.charCodeAt(0) <= 255 ? c.charCodeAt(0) : 63)).join('');
      expect(raw, text).toContain(winAnsi);
    }
    expect(raw).toContain('Bistrot \\(du\\) Quai');
  });

  it('continues long documents on new pages with the table header repeated', () => {
    const quote: Quote = {
      kind: 'quote', id: 'd1', client: 'c1', number: 'D-2026-0009', date: '2026-10-01', validUntil: '2026-10-31', status: 'sent', subject: 'Grand chantier', notes: '',
      lines: Array.from({ length: 60 }, (_, i) => ({ label: `Poste ${i + 1}`, qty: 2, unit: 'ml' as const, price: 32000, vat: 20 as const })), signedBy: '', acceptedAt: '', fingerprint: '', history: [],
    };
    const raw = latin1(buildPdf(quote, { ...client, type: 'part' }));
    const pages = Number(raw.match(/\/Count (\d+)/)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(raw.split('(suite').length - 1).toBe(pages - 1); // the parentheses are escaped in the PDF string
    expect(raw).not.toContain('frais de recouvrement'); // only for business clients
    expect(raw).toContain('Bon pour accord');
  });

  it('names the file after the document and the client, safely', () => {
    expect(pdfFileName(invoice, client)).toBe('facture-f-2026-0007-bistrot-du-quai.pdf');
  });
});
