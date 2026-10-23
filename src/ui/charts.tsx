// HTML/CSS charts: one series each (the title names it, no legend), thin bars with rounded data ends,
// hairline grid, tooltips on hover and on keyboard focus, direct labels only on the highest and the
// current value, and a data table twin behind every chart.
import { useState, type CSSProperties } from 'react';
import { useFormat } from '../format';
import { Link } from '../shared/router';

/** Round axis: 4 to 5 ticks at 1, 2, 2.5 or 5 times a power of ten. */
export function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 100_000, step: 25_000 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}

export interface Point { key: string; label: string; long: string; value: number; sub: string }

export function ColumnChart({ title, subtitle, points, head }: { title: string; subtitle: string; points: Point[]; head: [string, string, string] }) {
  const { t, compact, money0 } = useFormat();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 0);
  const { top, step } = niceScale(max * 1.12); // headroom for the label above the tallest bar
  const pct = (v: number) => `${(v / top) * 100}%`;
  const maxIdx = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? 0) ? i : best), 0);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);
  const tip = active !== null ? points[active] : null;
  return (
    <figure className="chart card">
      <figcaption><h2 className="chart-title">{title}</h2><p className="chart-sub">{subtitle}</p></figcaption>
      <div className="cc">
        <div className="cc-y" aria-hidden="true">{ticks.map((v) => <span key={v} style={{ bottom: pct(v) }}>{compact(v)}</span>)}</div>
        <div className="cc-plot">
          <div className="cc-grid" aria-hidden="true">{ticks.map((v) => <span key={v} style={{ bottom: pct(v) }} />)}</div>
          <ol className="cc-cols">
            {points.map((p, i) => (
              <li key={p.key} className="cc-col" tabIndex={0} aria-label={`${p.long} : ${money0(p.value)}, ${p.sub}`}
                onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
                <span className={`cc-bar ${i === points.length - 1 ? 'is-now' : ''}`} style={{ height: pct(p.value), '--i': i } as CSSProperties} />
                {(i === maxIdx || i === points.length - 1) && p.value > 0 ? <span className="cc-val" style={{ bottom: pct(p.value) }}>{compact(p.value)}</span> : null}
              </li>
            ))}
          </ol>
          {tip && active !== null ? (
            <div className="tip" role="tooltip" style={{ left: `${((active + 0.5) / points.length) * 100}%`, bottom: `min(${pct(tip.value)}, 85%)` }}>
              <strong>{money0(tip.value)}</strong><span>{tip.long}</span><span className="tip-sub">{tip.sub}</span>
            </div>
          ) : null}
        </div>
        <span />
        <div className="cc-x" aria-hidden="true">{points.map((p) => <span key={p.key}>{p.label}</span>)}</div>
      </div>
      <details className="data-table">
        <summary>{t('chart.data')}</summary>
        <div className="table-scroll">
          <table className="table">
            <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{points.map((p) => <tr key={p.key}><th scope="row">{p.long}</th><td className="num">{money0(p.value)}</td><td>{p.sub}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function BarList({ title, subtitle, rows }: { title: string; subtitle: string; rows: { label: string; value: number; to: string }[] }) {
  const { t, compact } = useFormat();
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <figure className="chart card">
      <figcaption><h2 className="chart-title">{title}</h2><p className="chart-sub">{subtitle}</p></figcaption>
      {rows.length ? (
        <ol className="hbars">
          {rows.map((r) => (
            <li key={r.to}>
              <Link to={r.to} className="hb-label">{r.label}</Link>
              <span className="hb-track"><span className="hb-bar" style={{ width: `${Math.max((r.value / max) * 100, 1)}%` }} /><span className="hb-val">{compact(r.value)}</span></span>
            </li>
          ))}
        </ol>
      ) : <p className="muted">{t('chart.empty')}</p>}
    </figure>
  );
}
