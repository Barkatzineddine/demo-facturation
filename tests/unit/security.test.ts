// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEMO_LOGINS, STAFF } from '../../src/domain/catalog';
import { clean, csv, hashPassword, isEmail, isName, isPhoneFR, normPhone, randomId, safeEqual, verifyPassword } from '../../src/shared/security';
import { evaluateGuard } from '../../src/shared/formGuard';

const ch = (code: number) => String.fromCharCode(code);

describe('clean', () => {
  it('removes control, zero-width and bidi-override characters', () => {
    const spoofed = `ad${ch(0x200b)}min${ch(0x202e)}gpj.exe${ch(0x0007)}${ch(0xfeff)}`;
    expect(clean(spoofed)).toBe('admingpj.exe');
  });
  it('collapses whitespace and caps the length', () => {
    expect(clean('  Jean   \n  Dupont ')).toBe('Jean Dupont');
    expect(clean('x'.repeat(500), 60)).toHaveLength(60);
  });
  it('keeps paragraphs in multi-line text but not endless blank lines', () => {
    expect(clean('Bonjour,\r\n\r\n\r\n\r\nMerci', 200, true)).toBe('Bonjour,\n\nMerci');
  });
  it('turns anything into a string', () => {
    expect(clean(null)).toBe('');
    expect(clean(42)).toBe('42');
  });
});

describe('validators', () => {
  it.each(['Inès', "Jean-Pierre O'Neil", 'Zoë Lefèvre'])('accepts the name %s', (v) => expect(isName(v)).toBe(true));
  it.each(['', 'A', '<script>', '1337', 'Robert"); DROP'])('rejects the name %s', (v) => expect(isName(v)).toBe(false));
  it('checks e-mail addresses', () => {
    expect(isEmail('camille.roux@example.com')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('x<y>@example.com')).toBe(false);
    expect(isEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
  it('accepts French phone numbers in any usual format and normalises them', () => {
    for (const v of ['06 12 34 56 78', '06.12.34.56.78', '+33612345678', '0033 6 12 34 56 78']) {
      expect(isPhoneFR(v)).toBe(true);
      expect(normPhone(v)).toBe('06 12 34 56 78');
    }
    expect(isPhoneFR('12345')).toBe(false);
    expect(isPhoneFR('00 12 34 56 78')).toBe(false);
  });
});

describe('identifiers', () => {
  it('uses an alphabet without ambiguous characters', () => {
    const ids = Array.from({ length: 200 }, () => randomId('MC-', 5));
    expect(ids.every((id) => /^MC-[A-HJ-NP-Z2-9]{5}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBeGreaterThan(195);
  });
});

describe('passwords (PBKDF2-SHA256)', () => {
  it('reproduces the stored hashes of the demo staff accounts', async () => {
    for (const login of DEMO_LOGINS) {
      const account = STAFF.find((s) => s.email === login.email);
      expect(account).toBeDefined();
      if (!account) return;
      expect(await verifyPassword(login.password, account.salt, account.hash)).toBe(true);
      expect(await verifyPassword(`${login.password} `, account.salt, account.hash)).toBe(false);
    }
  });
  it('salts every hash differently', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toBe(b.hash);
  });
  it('compares without an early exit', () => {
    expect(safeEqual('abcd', 'abcd')).toBe(true);
    expect(safeEqual('abcd', 'abce')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('CSV export', () => {
  const out = csv([['Nom', 'Note'], ['=HYPERLINK("http://evil")', '+33 6'], ['Dupont; Jean', 'dit "le barbu"'], ['-2+3', '@SUM(A1)']]);
  const [header, ...rows] = out.slice(1).split('\r\n');
  it('starts with a byte order mark for Excel and uses semicolons', () => {
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(header).toBe('Nom;Note');
  });
  it('neutralises formulas (CSV injection)', () => {
    expect(rows[0]).toBe(`"'=HYPERLINK(""http://evil"")";'+33 6`);
    expect(rows[2]).toBe("'-2+3;'@SUM(A1)");
  });
  it('quotes separators and quotes', () => {
    expect(rows[1]).toBe('"Dupont; Jean";"dit ""le barbu"""');
  });
});

describe('anti-spam guard', () => {
  const opts = { key: 't', max: 3, windowMs: 600_000, minMs: 2500, maxLinks: 1 };
  const base = { honeypot: '', elapsedMs: 10_000, text: 'Bonjour', log: [] as number[], now: 1_000_000 };
  it('lets a normal message through', () => expect(evaluateGuard(opts, base).ok).toBe(true));
  it('drops bots silently when the honeypot is filled', () => {
    expect(evaluateGuard(opts, { ...base, honeypot: 'http://spam' })).toEqual({ ok: false, silent: true });
  });
  it('refuses forms filled faster than a human can', () => {
    expect(evaluateGuard(opts, { ...base, elapsedMs: 800 })).toMatchObject({ ok: false, reason: 'too-fast' });
  });
  it('limits links', () => {
    expect(evaluateGuard(opts, { ...base, text: 'http://a.example www.b.example' })).toMatchObject({ ok: false, reason: 'too-many-links' });
  });
  it('rate-limits per device and says how long to wait', () => {
    const log = [base.now - 540_000, base.now - 60_000, base.now - 1000];
    expect(evaluateGuard(opts, { ...base, log })).toEqual({ ok: false, reason: 'rate-limited', waitMinutes: 1 });
    expect(evaluateGuard(opts, { ...base, log: [base.now - 700_000, ...log.slice(1)] }).ok).toBe(true);
  });
});
