// Who is signed in, per tab (sessionStorage), plus a login throttle: 5 failures -> 30 s pause.
import { create } from 'zustand';
import { STAFF, type StaffAccount } from '../domain/catalog';
import { logIn } from './app';

const KEY = 'morel:session';
const FAILS = 'morel:login-fails';

function restore(): StaffAccount | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { id?: unknown } | null;
    return STAFF.find((s) => s.id === raw?.id) ?? null;
  } catch { return null; }
}

export const useStaff = create<{ staff: StaffAccount | null }>(() => ({ staff: restore() }));

export function setStaff(staff: StaffAccount | null): void {
  useStaff.setState({ staff });
  try {
    if (staff) sessionStorage.setItem(KEY, JSON.stringify({ id: staff.id }));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
}

export type LoginOutcome = { ok: true } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'locked'; seconds: number };

export async function attemptLogin(email: string, password: string, now = Date.now()): Promise<LoginOutcome> {
  let fails: number[] = [];
  try { fails = (JSON.parse(sessionStorage.getItem(FAILS) ?? '[]') as number[]).filter((t) => now - t < 30_000); } catch { /* ignore */ }
  if (fails.length >= 5) return { ok: false, reason: 'locked', seconds: Math.ceil((30_000 - (now - (fails[0] ?? now))) / 1000) };
  const staff = await logIn(email, password);
  if (!staff) {
    try { sessionStorage.setItem(FAILS, JSON.stringify([...fails, now])); } catch { /* ignore */ }
    return { ok: false, reason: 'invalid' };
  }
  setStaff(staff);
  return { ok: true };
}
