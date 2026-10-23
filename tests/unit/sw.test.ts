// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATION_TIMEOUT_MS, serviceWorkerSource } from '../../build/plugins';

interface FetchEvent { request: Request; respondWith: (response: Promise<Response>) => void; waitUntil: (work: Promise<unknown>) => void }

/** Runs the generated worker against a fake network and cache; returns a function that performs one navigation. */
function worker(network: () => Promise<Response>, shell: Response | undefined) {
  const handlers: Record<string, (event: FetchEvent) => void> = {};
  const self = {
    location: { origin: 'https://demo.test' },
    addEventListener: (type: string, handler: (event: FetchEvent) => void) => { handlers[type] = handler; },
  };
  const caches = { match: () => Promise.resolve(shell) };
  // the generated worker is the code under test: run it as the browser would, with fakes for its globals
  new Function('self', 'caches', 'fetch', serviceWorkerSource(['./'], 'test'))(self, caches, network);
  return () => {
    let response: Promise<Response> | undefined;
    const request = { method: 'GET', url: 'https://demo.test/demo/', mode: 'navigate' } as Request;
    handlers.fetch?.({ request, respondWith: (r) => { response = r; }, waitUntil: () => undefined });
    if (!response) throw new Error('navigation not handled');
    return response;
  };
}
const hang = () => new Promise<Response>(() => undefined);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('service worker navigations', () => {
  it('answers from the network when it is quick', async () => {
    const navigate = worker(() => Promise.resolve(new Response('fresh')), new Response('shell'));
    expect(await (await navigate()).text()).toBe('fresh');
  });

  it('serves the cached shell when the network hangs, after the timeout and not before', async () => {
    const navigate = worker(hang, new Response('shell'));
    let settled = false;
    const response = navigate().then((r) => { settled = true; return r; });
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await (await response).text()).toBe('shell');
  });

  it('serves the cached shell at once when offline', async () => {
    const navigate = worker(() => Promise.reject(new TypeError('Failed to fetch')), new Response('shell'));
    expect(await (await navigate()).text()).toBe('shell');
  });

  it('keeps waiting for a slow network when nothing is cached yet', async () => {
    const late = () => new Promise<Response>((resolve) => { setTimeout(() => { resolve(new Response('late')); }, NAVIGATION_TIMEOUT_MS * 2); });
    const navigate = worker(late, undefined);
    const response = navigate();
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 2);
    expect(await (await response).text()).toBe('late');
  });

  it('fails when offline with nothing cached', async () => {
    const navigate = worker(() => Promise.reject(new TypeError('Failed to fetch')), undefined);
    await expect(navigate()).rejects.toThrow('offline and not cached');
  });
});
