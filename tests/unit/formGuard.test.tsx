import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFormGuard } from '../../src/shared/formGuard';

beforeEach(() => localStorage.clear());

describe('useFormGuard', () => {
  it('records accepted submissions on this device and rate-limits after the maximum', () => {
    const { result } = renderHook(() => useFormGuard({ key: 'contact', minMs: 0, max: 2 }));
    for (let i = 0; i < 2; i++) {
      const verdict = result.current.check('Bonjour');
      expect(verdict.ok).toBe(true);
      if (verdict.ok) verdict.commit();
    }
    expect(JSON.parse(localStorage.getItem('antispam:contact') ?? '[]')).toHaveLength(2);
    expect(result.current.check('Bonjour')).toMatchObject({ ok: false, reason: 'rate-limited' });
  });

  it('does not count a refused submission', () => {
    const { result } = renderHook(() => useFormGuard({ key: 'contact', minMs: 0 }));
    expect(result.current.check('http://a.example http://b.example')).toMatchObject({ ok: false, reason: 'too-many-links' });
    expect(localStorage.getItem('antispam:contact')).toBeNull();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('antispam:contact', '{not json');
    const { result } = renderHook(() => useFormGuard({ key: 'contact', minMs: 0 }));
    expect(result.current.check('Bonjour').ok).toBe(true);
  });
});
