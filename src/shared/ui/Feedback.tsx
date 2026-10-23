// Toasts (polite live region) and a promise-based confirm dialog, shared through context.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

type Tone = 'ok' | 'err' | 'info';
interface Toast { id: number; text: string; tone: Tone; action?: { label: string; run: () => void } }
interface ConfirmOptions { title: string; body?: string; ok: string; cancel: string; danger?: boolean }
interface FeedbackApi {
  toast: (text: string, tone?: Tone, action?: Toast['action']) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toast = useCallback<FeedbackApi['toast']>((text, tone = 'ok', action) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-3), { id, text, tone, action }]);
    setTimeout(() => dismiss(id), action ? 7000 : 4500);
  }, [dismiss]);
  const confirm = useCallback<FeedbackApi['confirm']>((options) => new Promise((resolve) => setPending({ ...options, resolve })), []);
  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  const settle = (value: boolean) => { pending?.resolve(value); setPending(null); };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span>{t.text}</span>
            {t.action ? <button type="button" className="toast-action" onClick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button> : null}
            <button type="button" className="toast-close" aria-label={closeLabel} onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
      <Dialog open={pending !== null} onClose={() => settle(false)} title={pending?.title ?? ''}>
        {pending?.body ? <p className="muted">{pending.body}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => settle(false)}>{pending?.cancel}</button>
          <button type="button" className={`btn ${pending?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => settle(true)}>{pending?.ok}</button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFeedback outside FeedbackProvider');
  return ctx;
}
