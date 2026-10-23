// Anti-spam without captcha: a honeypot field, a minimum time to fill the form, a per-device rate
// limit and a cap on links. check() tells the caller what to do; nothing is sent anywhere.
import { useCallback, useEffect, useRef } from 'react';

export type GuardVerdict =
  | { ok: true; commit: () => void }
  | { ok: false; silent: true }
  | { ok: false; silent?: false; reason: 'too-fast' | 'too-many-links' | 'rate-limited'; waitMinutes?: number };

export interface GuardOptions { key: string; max?: number; windowMs?: number; minMs?: number; maxLinks?: number }

export function evaluateGuard(
  opts: Required<GuardOptions>,
  input: { honeypot: string; elapsedMs: number; text: string; log: number[]; now: number },
): GuardVerdict {
  if (input.honeypot) return { ok: false, silent: true };
  if (input.elapsedMs < opts.minMs) return { ok: false, reason: 'too-fast' };
  if ((input.text.match(/https?:\/\/|www\.|\[url/gi) ?? []).length > opts.maxLinks) return { ok: false, reason: 'too-many-links' };
  const recent = input.log.filter((t) => input.now - t < opts.windowMs);
  if (recent.length >= opts.max) {
    const oldest = recent[0] ?? input.now;
    return { ok: false, reason: 'rate-limited', waitMinutes: Math.ceil((opts.windowMs - (input.now - oldest)) / 60_000) };
  }
  return { ok: true, commit: () => undefined };
}

export function useFormGuard(options: GuardOptions) {
  const opts: Required<GuardOptions> = { max: 3, windowMs: 10 * 60_000, minMs: 2500, maxLinks: 1, ...options };
  const armedAt = useRef(0);
  useEffect(() => { armedAt.current = performance.now(); }, []);
  const honeypot = useRef<HTMLInputElement>(null);
  const logKey = `antispam:${opts.key}`;

  const check = useCallback((text = ''): GuardVerdict => {
    let log: number[] = [];
    try { log = (JSON.parse(localStorage.getItem(logKey) ?? '[]') as number[]).filter(Number.isFinite); } catch { /* ignore */ }
    const now = Date.now();
    const verdict = evaluateGuard(opts, { honeypot: honeypot.current?.value ?? '', elapsedMs: performance.now() - armedAt.current, text, log, now });
    if (!verdict.ok) return verdict;
    return {
      ok: true,
      commit: () => {
        try { localStorage.setItem(logKey, JSON.stringify([...log.filter((t) => now - t < opts.windowMs), now])); } catch { /* ignore */ }
        armedAt.current = performance.now();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logKey]);

  return { honeypotRef: honeypot, check, rearm: () => { armedAt.current = performance.now(); } };
}
