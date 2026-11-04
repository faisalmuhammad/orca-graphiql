import React, { useEffect, useId, useRef } from 'react';
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="orca-dialog" ref={ref} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}><div className="dialog-heading"><h2 id={id}>{title}</h2><button aria-label="Close dialog" onClick={onClose}>×</button></div>{children}</dialog>;
}
