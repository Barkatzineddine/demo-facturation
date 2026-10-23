// Build step, after `vite build`: pre-renders the first screen into dist/index.html so a first visit
// shows the page before the JavaScript has arrived. The built app runs in headless Chrome with empty
// storage, and its rendered #root is copied into the HTML. public/boot.js shows that copy only to a
// first visit of the home page; the app replaces it on its first render.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { preview } from 'vite';

const DIST = 'dist';
const INDEX = join(DIST, 'index.html');
const EMPTY_ROOT = '<div id="root"></div>';

const template = readFileSync(INDEX, 'utf8');
if (!template.includes(EMPTY_ROOT)) throw new Error(`${INDEX} has no empty #root: run vite build first`);

async function launch(): Promise<Browser> {
  // the installed Chrome (laptops, GitHub runners), else Playwright's own Chromium
  try { return await chromium.launch({ channel: 'chrome' }); } catch { return chromium.launch(); }
}

const server = await preview({ preview: { port: 4190, strictPort: false }, logLevel: 'warn' });
const url = server.resolvedUrls?.local[0];
const browser = await launch();
try {
  if (!url) throw new Error('the preview server did not start');
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.locator('#root main h1').first().waitFor();
  await page.waitForTimeout(300); // let effects settle
  if (errors.length) throw new Error(`the app logged errors while pre-rendering:\n${errors.join('\n')}`);

  const { html, styles } = await page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) throw new Error('#root missing');
    const copy = root.cloneNode(true) as HTMLElement;
    // images below the fold wait for the app: on a slow line they would compete with the first screen
    copy.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      img.setAttribute('data-volatile', '');
    });
    // so do heavy drawings marked data-defer: the copy keeps their box, the app draws them
    copy.querySelectorAll('[data-defer]').forEach((el) => { el.replaceChildren(); });
    // the CSP refuses style attributes in HTML: each distinct one becomes a rule in a stylesheet
    const rules: string[] = [];
    copy.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const declarations = [...el.style].map((prop) => `${prop}:${el.style.getPropertyValue(prop)} !important`).join(';');
      let i = rules.indexOf(declarations);
      if (i < 0) { i = rules.length; rules.push(declarations); }
      el.setAttribute('data-ps', String(i));
      el.removeAttribute('style');
    });
    // eslint-disable-next-line no-restricted-properties -- reads the markup in the build browser, never writes any
    return { html: copy.innerHTML, styles: rules.map((d, i) => `[data-ps="${i}"]{${d}}`).join('\n') };
  });

  // inert: a picture of the page until the app replaces it, so no click or typing lands in the copy
  let out = template.replace(EMPTY_ROOT, `<div id="root"><div data-prerendered inert>${html}</div></div>`);
  if (styles) {
    const file = `assets/prerender-${createHash('sha256').update(styles).digest('hex').slice(0, 8)}.css`;
    writeFileSync(join(DIST, file), `${styles}\n`);
    out = out.replace('</head>', `<link rel="stylesheet" href="${server.config.base}${file}">\n</head>`);
    // offline visits read it from the service worker's cache like the rest of the app
    const sw = join(DIST, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace('const PRECACHE = [', `const PRECACHE = [${JSON.stringify(file)},`));
  }
  writeFileSync(INDEX, out);
  console.log(`pre-rendered ${INDEX}: ${Math.round(html.length / 1024)} KB of HTML${styles ? ', plus a stylesheet for its inline styles' : ''}`);
} finally {
  await browser.close();
  await server.close();
}
