import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { createPersistedStore } from '../../src/shared/store';

const schema = z.object({ count: z.int().check(z.gte(0), z.lte(100)), name: z.string().check(z.maxLength(10)) });
type S = z.infer<typeof schema>;
const seed = (): S => ({ count: 0, name: 'seed' });
let key = '';

beforeEach(() => {
  key = `test:${Math.random()}`;
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe('persisted store', () => {
  it('starts from the seed and saves it', () => {
    const store = createPersistedStore(key, schema, seed);
    expect(store.get()).toEqual(seed());
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual(seed());
  });

  it('loads valid saved data', () => {
    localStorage.setItem(key, JSON.stringify({ count: 7, name: 'saved' }));
    expect(createPersistedStore(key, schema, seed).get()).toEqual({ count: 7, name: 'saved' });
  });

  it.each([
    ['broken JSON', '{"count": 7,'],
    ['a wrong type', '{"count": "7", "name": "x"}'],
    ['an out-of-range value', '{"count": 1e9, "name": "x"}'],
    ['an oversized string', JSON.stringify({ count: 1, name: '<img src=x onerror=alert(1)>' })],
  ])('falls back to the seed on %s', (_label, raw) => {
    localStorage.setItem(key, raw);
    expect(createPersistedStore(key, schema, seed).get()).toEqual(seed());
  });

  it('validates every update and refuses to save an invalid state', () => {
    const store = createPersistedStore(key, schema, seed);
    store.update((s) => { s.count = 5; });
    expect(store.get().count).toBe(5);
    expect(() => store.update((s) => { s.count = -1; })).toThrow(/count/);
    expect(store.get().count).toBe(5);
    expect(JSON.parse(localStorage.getItem(key) ?? 'null').count).toBe(5);
  });

  it('never mutates the current state in place (React sees a new object)', () => {
    const store = createPersistedStore(key, schema, seed);
    const before = store.get();
    store.update((s) => { s.count = 1; });
    expect(before.count).toBe(0);
    expect(store.get()).not.toBe(before);
  });

  it('syncs another tab and tells it what happened', async () => {
    const tabA = createPersistedStore(key, schema, seed);
    const tabB = createPersistedStore(key, schema, seed);
    const received = new Promise((resolve) => tabB.onRemoteEvent(resolve));
    tabA.update((s) => { s.count = 42; }, { type: 'count.changed', id: 'x' });
    expect(await received).toEqual({ type: 'count.changed', id: 'x' });
    expect(tabB.get().count).toBe(42);
  });
});

describe('cross-tab messages', () => {
  it('apply the state sent with the message, even before storage catches up', async () => {
    const tab = createPersistedStore(key, schema, seed);
    const sender = new BroadcastChannel(key);
    const received = new Promise((resolve) => tab.onRemoteEvent(resolve));
    sender.postMessage({ event: { type: 'x' }, state: { count: 9, name: 'remote' } }); // storage still says 0
    await received;
    expect(tab.get()).toEqual({ count: 9, name: 'remote' });
    sender.close();
  });

  it('ignore an invalid state in a message', async () => {
    const tab = createPersistedStore(key, schema, seed);
    const sender = new BroadcastChannel(key);
    const received = new Promise((resolve) => tab.onRemoteEvent(resolve));
    sender.postMessage({ event: { type: 'x' }, state: { count: 'lots', name: '<script>' } });
    await received;
    expect(tab.get()).toEqual(seed());
    sender.close();
  });
});
