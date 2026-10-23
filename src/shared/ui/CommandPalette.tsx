// Ctrl/⌘ K command palette: instant fuzzy search across whatever items the page provides,
// full keyboard navigation (arrows, Enter, Escape), ARIA combobox + listbox.
import { useEffect, useId, useMemo, useState } from 'react';
import { Dialog } from './Dialog';

export interface Command { id: string; label: string; hint?: string; group: string; keywords?: string; run: () => void }

/** Subsequence match with a bonus for word starts; returns -1 when the query is not found. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!q) return 0;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let score = 0, ti = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    score += found === 0 || t[found - 1] === ' ' ? 3 : 1;
    ti = found + 1;
  }
  return score;
}

export function CommandPalette({ commands, labels }: {
  commands: Command[];
  labels: { title: string; placeholder: string; empty: string; open: string };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => commands
    .map((c) => ({ c, s: fuzzyScore(query, `${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((r) => r.c), [commands, query]);

  const close = () => { setOpen(false); setQuery(''); setActive(0); };
  const run = (c: Command | undefined) => { if (!c) return; close(); c.run(); };

  return (
    <>
      <button type="button" className="palette-open" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K Meta+K">
        <span>{labels.open}</span><kbd>Ctrl K</kbd>
      </button>
      <Dialog open={open} onClose={close} title={labels.title} className="palette">
        <input
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
          data-autofocus
          value={query}
          placeholder={labels.placeholder}
          onChange={(e) => { setQuery(e.target.value.slice(0, 60)); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
          }}
        />
        <ul id={listId} role="listbox" className="palette-list">
          {results.length === 0 ? <li className="muted palette-empty">{labels.empty}</li> : null}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={i === active}
              className="palette-item"
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span className="palette-group">{c.group}</span>
              <span className="palette-label">{c.label}</span>
              {c.hint ? <span className="palette-hint">{c.hint}</span> : null}
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
