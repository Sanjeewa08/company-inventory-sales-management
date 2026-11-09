import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
