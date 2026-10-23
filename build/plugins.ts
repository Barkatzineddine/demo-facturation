/// <reference types="node" />
// Build-time plugins: the CSP meta tag (only in production, the dev server needs inline HMR code)
// and a small service worker that precaches the app shell for offline use.
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  // the only Trusted Types policy allowed: it vets the service worker URL (see src/shared/sw.ts)
  'trusted-types sw-url',
].join('; ');

export function cspPlugin(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('<!-- CSP -->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
    },
  };
}

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/**
 * Writes sw.js with the list of every emitted file, versioned by a hash of that list. Public files
 * are precached too when `keepPublic` accepts them (fonts, icons, small images; not the big photos).
 */
export function serviceWorkerPlugin(keepPublic: (file: string) => boolean = () => true): Plugin {
  let publicDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const statics = publicDir ? walk(publicDir).map((f) => relative(publicDir, f).split('\\').join('/')).filter(keepPublic) : [];
      const precache = ['./', ...files, ...statics].sort();
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(precache, version) });
    },
  };
}

function serviceWorkerSource(precache: string[], version: string): string {
  return `// Generated at build time. Cache-first for the app shell, network-first for navigations.
const CACHE = 'app-${version}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`;
}
