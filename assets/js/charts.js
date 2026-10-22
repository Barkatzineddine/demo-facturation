// HTML/CSS charts: one series each (no legend box, the title names it), thin bars with 4px rounded
// data ends, hairline grid, hover + keyboard tooltips, selective direct labels and a data table twin.
import { h } from './core.js';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const compact = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: v >= 10000 ? 0 : 1 })} k€` : `${Math.round(v)} €`);

function niceScale(max) {
  if (max <= 0) return { top: 1000, step: 250 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

function tooltipLayer(fig) {
  const tip = h('div', { class: 'tip', role: 'tooltip', hidden: true });
  fig.append(tip);
  return {
    show(target, value, label, sub) {
      tip.replaceChildren(h('strong', null, value), h('span', null, label), sub ? h('span', { class: 'tip-sub' }, sub) : null);
      tip.hidden = false;
      const f = fig.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2 - f.left, 70), f.width - 70);
      tip.style.left = `${x}px`;
      tip.style.top = `${Math.max(r.top - f.top - 8, 0)}px`;
    },
    hide() { tip.hidden = true; },
  };
}

/**
 * Column chart. points: [{ label, long, value, sub }]. labelIdx: indexes that get a direct label.
 */
export function columnChart({ title, subtitle, points, tableHead }) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const { top, step } = niceScale(max * 1.12); // headroom for the direct label above the tallest bar
  const pct = (v) => `${(v / top) * 100}%`;
  const maxIdx = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const labelIdx = new Set([maxIdx, points.length - 1]);

  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const yAxis = h('div', { class: 'cc-y', 'aria-hidden': 'true' }, ticks.map((v) => {
    const t = h('span', null, compact(v));
    t.style.bottom = pct(v);
    return t;
  }));
  const grid = h('div', { class: 'cc-grid', 'aria-hidden': 'true' }, ticks.map((v) => {
    const g = h('span');
    g.style.bottom = pct(v);
    return g;
  }));
  const fig = h('figure', { class: 'chart card' });
  const tip = tooltipLayer(fig);
  const cols = h('ol', { class: 'cc-cols' }, points.map((p, i) => {
    const bar = h('span', { class: 'cc-bar' });
    bar.style.height = pct(p.value);
    const val = labelIdx.has(i) && p.value > 0 ? h('span', { class: 'cc-val' }, compact(p.value)) : null;
    if (val) val.style.bottom = pct(p.value);
    const col = h('li', { class: 'cc-col', tabindex: '0', 'aria-label': `${p.long} : ${eur.format(p.value)}${p.sub ? `, ${p.sub}` : ''}` }, bar, val);
    const show = () => tip.show(bar.offsetHeight ? bar : col, eur.format(p.value), p.long, p.sub);
    col.addEventListener('pointerenter', show);
    col.addEventListener('focus', show);
    col.addEventListener('pointerleave', tip.hide);
    col.addEventListener('blur', tip.hide);
    return col;
  }));
  const xAxis = h('div', { class: 'cc-x', 'aria-hidden': 'true' }, points.map((p) => h('span', null, p.label)));
  fig.append(
    h('figcaption', null, h('h2', { class: 'chart-title' }, title), subtitle ? h('p', { class: 'chart-sub' }, subtitle) : null),
    h('div', { class: 'cc' }, yAxis, h('div', { class: 'cc-plot' }, grid, cols), h('span'), xAxis),
    h('details', { class: 'data-table' },
      h('summary', null, 'Voir les données'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, tableHead.map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, points.map((p) => h('tr', null, h('th', { scope: 'row' }, p.long), h('td', { class: 'num' }, eur.format(p.value)), h('td', { class: 'num' }, p.count ?? ''))))))));
  return fig;
}

/** Horizontal bars with the value at the tip. rows: [{ label, value, href }] */
export function barList({ title, subtitle, rows }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return h('figure', { class: 'chart card' },
    h('figcaption', null, h('h2', { class: 'chart-title' }, title), subtitle ? h('p', { class: 'chart-sub' }, subtitle) : null),
    rows.length ? h('ol', { class: 'hbars' }, rows.map((r) => {
      const bar = h('span', { class: 'hb-bar' });
      bar.style.width = `${Math.max((r.value / max) * 100, 1)}%`;
      return h('li', null,
        h('a', { href: r.href, class: 'hb-label' }, r.label),
        h('span', { class: 'hb-track' }, bar, h('span', { class: 'hb-val' }, compact(r.value))));
    })) : h('p', { class: 'muted' }, 'Pas encore de données sur cette période.'));
}
