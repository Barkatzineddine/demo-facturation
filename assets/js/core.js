// Shared helpers: safe DOM building, local storage, input cleaning, anti-spam, demo banner.
// No innerHTML anywhere: the page enforces Trusted Types, so every node is built here.

const SVG_NS = 'http://www.w3.org/2000/svg';
const HAS_SCHEME = /^\s*[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME = /^(?:https?|mailto|tel|blob):/i;
const SAFE_IMG = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const unsafeUrl = (k, v) => HAS_SCHEME.test(v) && !SAFE_SCHEME.test(v) && !(k === 'src' && SAFE_IMG.test(v));
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'open', 'indeterminate']);

function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'data') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else if (k === 'style' || /^on/i.test(k)) throw new Error(`Attribut interdit : ${k}`);
    else if ((k === 'href' || k === 'src') && unsafeUrl(k, String(v))) continue; // blocks javascript: and friends
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

/** Create an HTML element: h('a', { href, class, on: { click } }, 'texte', child) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, kids);
  return el;
}

/** Same as h() for SVG elements. */
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, kids);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Replace the children of `el` (safe alternative to innerHTML). */
export function mount(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

// ---------- Input cleaning and validation ----------

// Control characters, zero-width characters and bidi overrides (used to spoof displayed text).
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function clean(value, max = 120, multiline = false) {
  let out = String(value ?? '').normalize('NFC').replace(INVISIBLE, '');
  out = multiline
    ? out.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : out.replace(/\s+/g, ' ');
  return out.trim().slice(0, max);
}

export const valid = {
  name: (v) => /^[\p{L}][\p{L}\p{M}' .-]{1,59}$/u.test(v),
  email: (v) => v.length <= 254 && /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i.test(v),
  phone: (v) => /^(?:\+33|0033|0)[1-9]\d{8}$/.test(v.replace(/[\s.-]/g, '')),
};

export const normPhone = (v) => v.replace(/[\s.-]/g, '').replace(/^(?:\+33|0033)/, '0').replace(/(\d{2})(?=\d)/g, '$1 ');

/** Show or clear a field error; returns true when the field is valid. */
export function fieldError(input, message) {
  const id = `${input.id}-err`;
  let err = document.getElementById(id);
  if (!message) {
    input.removeAttribute('aria-invalid');
    err?.remove();
    return true;
  }
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', id);
  if (!err) {
    err = h('p', { id, class: 'field-error' });
    input.closest('.field')?.append(err);
  }
  err.textContent = message;
  return false;
}

// ---------- Anti-spam: honeypot, minimum fill time, rate limit, link count ----------

/**
 * Guard a form. `check(text)` returns { ok, silent, msg, commit }.
 * silent = a bot filled the honeypot: pretend it worked, store nothing.
 */
export function guard(form, { key, max = 3, windowMs = 10 * 60e3, minMs = 2500, maxLinks = 1 }) {
  let armedAt = performance.now();
  const logKey = `antispam:${key}`;
  const readLog = () => {
    try { return (JSON.parse(localStorage.getItem(logKey)) || []).filter((t) => Date.now() - t < windowMs); } catch { return []; }
  };
  return {
    arm() { armedAt = performance.now(); },
    check(text = '') {
      const trap = form.querySelector('.hp input');
      if (trap && trap.value) return { ok: false, silent: true };
      if (performance.now() - armedAt < minMs) return { ok: false, msg: 'Envoi trop rapide : merci de vérifier le formulaire puis de réessayer.' };
      if ((text.match(/https?:\/\/|www\.|\[url/gi) || []).length > maxLinks) return { ok: false, msg: 'Merci de ne pas inclure de liens dans le message.' };
      const log = readLog();
      if (log.length >= max) {
        const wait = Math.ceil((windowMs - (Date.now() - log[0])) / 60e3);
        return { ok: false, msg: `Trop d'envois depuis cet appareil. Réessayez dans ${wait} min.` };
      }
      return {
        ok: true,
        commit() { try { localStorage.setItem(logKey, JSON.stringify([...log, Date.now()])); } catch { /* storage full or blocked */ } },
      };
    },
  };
}

/** Honeypot field: invisible to people, tempting for bots. */
export function honeypot(name = 'site_web') {
  return h('div', { class: 'hp', 'aria-hidden': 'true' },
    h('label', { for: `hp-${name}` }, 'Ne pas remplir'),
    h('input', { id: `hp-${name}`, name, type: 'text', tabindex: '-1', autocomplete: 'off' }));
}

// ---------- Storage ----------

/**
 * Versioned JSON state in localStorage, validated on load, synced across tabs.
 * Corrupt or tampered data falls back to the seed instead of breaking the page.
 */
export function createStore(key, seed, validate, { onError } = {}) {
  const listeners = new Set();
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        if (validate(data)) return data;
      }
    } catch { /* invalid JSON or storage blocked */ }
    return null;
  };
  let state = read();
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify(state)); return true; } catch { onError?.(); return false; } // quota or private mode
  };
  if (!state) { state = seed(); persist(); }
  window.addEventListener('storage', (e) => {
    if (e.key !== key) return;
    state = read() || seed();
    listeners.forEach((fn) => fn(state));
  });
  return {
    get: () => state,
    update(fn) { fn(state); persist(); listeners.forEach((l) => l(state)); },
    reset() { state = seed(); persist(); listeners.forEach((l) => l(state)); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export function uid(prefix = '', len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return prefix + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Formatting ----------

export const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const euro0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
/** Local date-time 'YYYY-MM-DDTHH:MM:SS' (toISOString would give UTC). */
export function localStamp(d = new Date()) {
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const fmtDay = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('fr-FR', opts).format(parseDate(iso));

/** Download text as a file (blob URL, no network). */
export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function csv(rows) {
  const cell = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // neutralise spreadsheet formulas (CSV injection)
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

// ---------- UI: toasts, confirm dialog, demo banner ----------

let toastRegion;
export function toast(message, type = 'ok') {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const t = h('div', { class: ['toast', `toast-${type}`] }, message);
  toastRegion.append(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4300);
}

/** Accessible confirm built on <dialog>; resolves true/false. */
export function confirmDialog({ title, body, ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' },
      h('form', { method: 'dialog' },
        h('h2', { id: 'dlg-title' }, title),
        body ? h('p', null, body) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn btn-ghost', value: 'no' }, cancel),
          h('button', { class: ['btn', danger ? 'btn-danger' : 'btn-primary'], value: 'yes' }, ok))));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * Demo banner (static markup in the page, so nothing shifts on load):
 * wires the "Réinitialiser la démo" button, which clears every key with this prefix.
 */
export function demoBanner({ prefix }) {
  const reset = document.querySelector('.demo-reset');
  reset?.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Réinitialiser la démo ?',
      body: 'Toutes les données saisies dans ce navigateur seront remplacées par les données de départ.',
      ok: 'Réinitialiser',
      danger: true,
    });
    if (!yes) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(prefix) || k.startsWith('antispam:')).forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch { /* storage blocked */ }
    location.hash = '';
    location.reload();
  });
}
