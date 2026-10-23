// A persisted Zustand store: validated with Zod on every read (tampered or corrupt data falls back
// to the seed), saved to localStorage, and synchronised live across tabs with BroadcastChannel.
import { create, type StoreApi, type UseBoundStore } from 'zustand';

/** Any validator with Zod's safeParse shape; the store does not depend on Zod itself. */
export interface Schema<S> { safeParse: (data: unknown) => { success: true; data: S } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }

export interface LiveEvent { type: string; [key: string]: string | number | undefined }

export interface PersistedStore<S> {
  use: UseBoundStore<StoreApi<{ data: S }>>;
  get: () => S;
  /** Mutate a copy of the state; `event` is broadcast to the other tabs (toasts, live badges). */
  update: (recipe: (draft: S) => void, event?: LiveEvent) => void;
  reset: () => void;
  onRemoteEvent: (listener: (event: LiveEvent) => void) => () => void;
}

export function createPersistedStore<S>(key: string, schema: Schema<S>, seed: () => S): PersistedStore<S> {
  const read = (): S | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // invalid JSON or storage blocked
    }
  };
  const write = (state: S) => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* quota exceeded or private mode */ }
  };

  const initial = read() ?? seed();
  write(initial);
  const use = create<{ data: S }>(() => ({ data: initial }));
  const listeners = new Set<(event: LiveEvent) => void>();
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(key);

  const reload = () => {
    const fresh = read();
    if (fresh) use.setState({ data: fresh });
  };
  // The message carries the new state: another tab's localStorage write can reach this tab after
  // the message does, so reading storage here could miss the change. Validated like a load.
  channel?.addEventListener('message', (message: MessageEvent<{ event?: LiveEvent; state?: unknown }>) => {
    const parsed = schema.safeParse(message.data?.state);
    if (parsed.success) use.setState({ data: parsed.data });
    else reload();
    const event = message.data?.event;
    if (event) listeners.forEach((fn) => fn(event));
  });
  // fallback for browsers without BroadcastChannel: the storage event also fires in other tabs
  window.addEventListener('storage', (e) => { if (e.key === key) reload(); });

  return {
    use,
    get: () => use.getState().data,
    update(recipe, event) {
      const next = structuredClone(use.getState().data);
      recipe(next);
      const checked = schema.safeParse(next);
      if (!checked.success) {
        const issue = checked.error.issues[0];
        throw new Error(`Invalid state after update: ${issue ? `${issue.path.map(String).join('.')}: ${issue.message}` : ''}`);
      }
      use.setState({ data: checked.data });
      write(checked.data);
      channel?.postMessage({ event, state: checked.data });
    },
    reset() {
      const fresh = seed();
      use.setState({ data: fresh });
      write(fresh);
      channel?.postMessage({ event: { type: 'reset' }, state: fresh });
    },
    onRemoteEvent(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
