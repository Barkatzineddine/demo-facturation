import { useId, type InputHTMLAttributes, type ReactNode, type RefObject, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface Base { label: ReactNode; error?: string | null; hint?: ReactNode }

/** Labelled input with an inline error linked through aria-describedby. */
export function Field({ label, error, hint, ...input }: Base & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
      {error ? <p id={`${id}-err`} className="field-error">{error}</p> : null}
    </div>
  );
}

export function TextArea({ label, error, hint, ...input }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} {...input} />
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p id={`${id}-err`} className="field-error">{error}</p> : null}
    </div>
  );
}

export function Select({ label, children, ...input }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...input}>{children}</select>
    </div>
  );
}

export function Checkbox({ label, error, ...input }: Base & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field check">
      <input id={id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} {...input} />
      <label htmlFor={id}>{label}</label>
      {error ? <p id={`${id}-err`} className="field-error">{error}</p> : null}
    </div>
  );
}

/** Hidden from people (off-screen, aria-hidden, no tab stop), tempting for bots. */
export function Honeypot({ inputRef, label }: { inputRef: RefObject<HTMLInputElement | null>; label: string }) {
  const id = useId();
  return (
    <div className="hp" aria-hidden="true">
      <label htmlFor={id}>{label}</label>
      <input id={id} ref={inputRef} name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}
