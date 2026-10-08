import { useEffect, useLayoutEffect, useRef } from 'react';
import { CloseIcon } from './Icons.jsx';

/** A native <dialog> shown while mounted. `onClose` runs when the user dismisses it. */
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg.open) dlg.showModal();
    bodyRef.current.focus(); // rather than putting a focus ring on the close button
    const handle = () => onCloseRef.current?.();
    dlg.addEventListener('close', handle);
    return () => {
      dlg.removeEventListener('close', handle);
      if (dlg.open) dlg.close();
    };
  }, []);

  return (
    <dialog ref={ref} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" type="button" aria-label="Close" onClick={() => ref.current.close()}>
          <CloseIcon />
        </button>
      </div>
      <div className="modal-body" ref={bodyRef} tabIndex={-1}>
        {children}
      </div>
    </dialog>
  );
}
