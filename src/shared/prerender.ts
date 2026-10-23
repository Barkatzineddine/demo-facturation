import { useEffect } from 'react';

/**
 * A first visit starts on the pre-rendered page (build/prerender.ts, public/boot.js), with entrance
 * animations skipped so the app's first render replaces it without replaying them. Two seconds
 * later, longer than any entrance animation, they come back for the next screens.
 */
export function usePrerenderHandoff(): void {
  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.prerender !== 'shown') return;
    const id = setTimeout(() => { delete html.dataset.prerender; }, 2000);
    return () => { clearTimeout(id); };
  }, []);
}
