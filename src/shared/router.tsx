// Minimal typed hash router: GitHub Pages serves a single index.html, so routes live in the hash
// ("#/reserver"). A hash without the leading slash ("#contact") stays an in-page anchor.
import { flushSync } from 'react-dom';
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

export interface Location { path: string; query: URLSearchParams; anchor: string | null }

function parse(hash: string): Location {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith('/')) return { path: '/', query: new URLSearchParams(), anchor: raw || null };
  const [path = '/', query = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(query), anchor: null };
}

let current = parse(window.location.hash);
const listeners = new Set<() => void>();

function onChange(): void {
  const next = parse(window.location.hash);
  const notify = () => { current = next; listeners.forEach((l) => l()); };
  // animated page change where supported, instant otherwise or with reduced motion
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (doc.startViewTransition && !reduce && next.path !== current.path) {
    // the browser aborts a transition when the viewport changes (mobile toolbars): the page still updates
    const transition = doc.startViewTransition(() => flushSync(notify));
    transition.ready.catch(() => undefined);
    transition.finished.catch(() => undefined);
  } else notify();
}
window.addEventListener('hashchange', onChange);

export function useLocation(): Location {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current);
}

/** `replace` updates the address without a new history entry (filters, search as you type). */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (!options.replace) { window.location.hash = hash; return; }
  history.replaceState(history.state, '', hash);
  onChange();
}

/** Match "/staff/booking/:id" against a path; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i] as string;
    const val = s[i] as string;
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return null;
  }
  return params;
}

export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={`#${to}`} {...rest} />;
}

let firstPage = true;

/**
 * Per-page tab title, and after an in-app navigation, focus on the page heading so screen readers
 * announce the new page (not on the first load, nor when jumping to an anchor).
 */
export function usePage(title: string): void {
  useEffect(() => { document.title = title; }, [title]);
  useEffect(() => {
    if (firstPage) { firstPage = false; return; }
    if (parse(window.location.hash).anchor) return;
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, []);
}

/** Scroll to the in-page anchor (or the top for a new route) after render. */
export function useScrollOnNavigate(location: Location): void {
  useEffect(() => {
    if (location.anchor) document.getElementById(location.anchor)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location.path, location.anchor]);
}
