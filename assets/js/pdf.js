// Minimal PDF 1.4 writer, no dependency: standard Helvetica fonts (WinAnsi encoding, so French
// accents, « » and € work), text, rectangles and lines. Coordinates are in points from the top-left.

// Glyph widths (1/1000 em) for WinAnsi codes 32..255, from the Adobe Helvetica AFM files.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

const UNI_TO_WINANSI = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02c6: 136, 0x2030: 137,
  0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149,
  0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155, 0x0153: 156, 0x017e: 158, 0x0178: 159,
  0x202f: 160, 0x2009: 32, 0x2007: 32, // narrow/thin spaces used by Intl number formatting
};

export const A4 = { w: 595.28, h: 841.89 };

function toCodes(text) {
  const out = [];
  for (const ch of String(text).normalize('NFC')) {
    const cp = ch.codePointAt(0);
    if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255)) out.push(cp);
    else if (UNI_TO_WINANSI[cp] !== undefined) out.push(UNI_TO_WINANSI[cp]);
    else if (cp === 10 || cp === 9) out.push(32);
    else out.push(63); // '?'
  }
  return out;
}

export function textWidth(text, size, bold = false) {
  const w = bold ? W_BOLD : W_REG;
  return toCodes(text).reduce((s, c) => s + (w[c - 32] || 556), 0) * size / 1000;
}

/** Greedy word wrap on measured widths. */
export function wrap(text, size, maxWidth, bold = false) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (textWidth(test, size, bold) <= maxWidth || !line) line = test;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

// PDF string literal: escape "(", ")" and backslash with a backslash
const esc = (codes) => codes.map((c) => (c === 40 || c === 41 || c === 92 ? '\\' : '') + String.fromCharCode(c)).join('');
const n = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map((x) => x.toFixed(3)).join(' '); };

export class PdfDoc {
  constructor({ title = 'Document', author = '' } = {}) {
    this.pages = [];
    this.meta = { title, author };
    this.addPage();
  }

  addPage() { this.ops = []; this.pages.push(this.ops); return this; }

  text(str, x, y, { size = 10, bold = false, color = '#1f2430', align = 'left', angle = 0 } = {}) {
    let tx = x;
    if (align !== 'left') { const w = textWidth(str, size, bold); tx = align === 'right' ? x - w : x - w / 2; }
    const py = A4.h - y;
    let m = `1 0 0 1 ${n(tx)} ${n(py)}`;
    if (angle) { const a = angle * Math.PI / 180; m = `${n(Math.cos(a))} ${n(Math.sin(a))} ${n(-Math.sin(a))} ${n(Math.cos(a))} ${n(tx)} ${n(py)}`; }
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${rgb(color)} rg ${m} Tm (${esc(toCodes(str))}) Tj ET`);
    return this;
  }

  rect(x, y, w, h, { fill = null, stroke = null, width = 0.8 } = {}) {
    const parts = [];
    if (fill) parts.push(`${rgb(fill)} rg`);
    if (stroke) parts.push(`${rgb(stroke)} RG ${n(width)} w`);
    parts.push(`${n(x)} ${n(A4.h - y - h)} ${n(w)} ${n(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    this.ops.push(parts.join(' '));
    return this;
  }

  line(x1, y1, x2, y2, { color = '#d6d9e0', width = 0.8 } = {}) {
    this.ops.push(`${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(A4.h - y1)} m ${n(x2)} ${n(A4.h - y2)} l S`);
    return this;
  }

  /** Serialise to bytes. Content streams are left uncompressed (small documents). */
  output() {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null);
    const pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const content = ops.join('\n');
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cId} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const d = new Date();
    const stamp = `D:${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
    const info = add(`<< /Title (${esc(toCodes(this.meta.title))}) /Author (${esc(toCodes(this.meta.author))}) /Producer (Demo facturation, PDF writer maison) /CreationDate (${stamp}) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255; // every char is < 256 by construction
    return bytes;
  }
}
