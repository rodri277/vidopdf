import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  labelledBy: string;
  /** Escape was pressed (or the browser asked to close the dialog). */
  onClose: () => void;
  /** Key presses inside the dialog, for dialogs with their own navigation. */
  onKey?: (event: KeyboardEvent) => void;
  className?: string;
  children: ReactNode;
}

/** A native modal dialog: the browser provides the focus trap, the backdrop and Escape. */
export function Modal({ open, labelledBy, onClose, onKey, className, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    const element = dialog.current;
    if (element === null || onKey === undefined) return;
    element.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('keydown', onKey);
    };
  }, [onKey]);

  return (
    <dialog
      ref={dialog}
      className={`modal ${className ?? ''}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
