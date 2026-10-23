// Input hygiene, identifiers, hashing and CSV export. Pure functions, unit-tested.

// Control characters, zero-width characters and bidi overrides (used to spoof displayed text).
const INVISIBLE_RANGES: [number, number][] = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const INVISIBLE = new RegExp(`[${INVISIBLE_RANGES.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join('')}]`, 'gu');

/** Normalise user text: NFC, invisible characters removed, whitespace collapsed, length capped. */
export function clean(value: unknown, max = 120, multiline = false): string {
  let out = String(value ?? '').normalize('NFC').replace(INVISIBLE, '');
  out = multiline
    ? out.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : out.replace(/\s+/g, ' ');
  return out.trim().slice(0, max);
}

export const patterns = {
  name: /^[\p{L}][\p{L}\p{M}' .-]{1,59}$/u,
  email: /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i,
  phoneFR: /^(?:\+33|0033|0)[1-9]\d{8}$/,
};

export const isName = (v: string) => patterns.name.test(v);
export const isEmail = (v: string) => v.length <= 254 && patterns.email.test(v);
export const isPhoneFR = (v: string) => patterns.phoneFR.test(v.replace(/[\s.-]/g, ''));
export const normPhone = (v: string) =>
  v.replace(/[\s.-]/g, '').replace(/^(?:\+33|0033)/, '0').replace(/(\d{2})(?=\d)/g, '$1 ');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Random identifier from crypto.getRandomValues (no ambiguous characters). */
export function randomId(prefix = '', length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return prefix + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export const PBKDF2_ITERATIONS = 100_000;

/** PBKDF2-SHA256 with a random 16-byte salt (WebCrypto). Returns hex salt and hash. */
export async function hashPassword(password: string, saltHex?: string): Promise<{ salt: string; hash: string }> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { salt: toHex(salt.buffer as ArrayBuffer), hash: toHex(bits) };
}

/** Constant-time comparison of two hex strings of equal length. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  return safeEqual((await hashPassword(password, salt)).hash, hash);
}

/** CSV for spreadsheets: semicolon-separated, BOM for Excel, formula injection neutralised. */
export function csv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Download text or bytes as a file through a blob URL (no network). */
export function download(filename: string, content: string | Uint8Array, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
