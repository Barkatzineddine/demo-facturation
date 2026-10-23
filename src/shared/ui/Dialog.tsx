import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Native modal <dialog>: focus trap, Escape and backdrop handled by the browser. Focus goes to the
 * child marked data-autofocus, else the browser picks the first focusable one (Cancel, in confirms).
 */
export function Dialog({ open, onClose, title, children, wide = false, className = '' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      dlg.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dlg.open) dlg.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''} ${className}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {open ? (
        <div className="dialog-inner">
          <h2 id={titleId} className="dialog-title">{title}</h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
