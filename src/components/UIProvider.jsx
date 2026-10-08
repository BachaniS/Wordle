import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal } from './Modal.jsx';

const UIContext = createContext(null);
let toastSeq = 0;

/** App-wide toasts and an awaitable confirm() dialog. */
export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [question, setQuestion] = useState(null);

  const toast = useCallback((text, ms = 1600) => {
    const id = ++toastSeq;
    setToasts((t) => [{ id, text }, ...t].slice(0, 4));
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))), ms);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms + 300);
  }, []);

  const confirm = useCallback(
    (text, okLabel = 'Yes') => new Promise((resolve) => setQuestion({ text, okLabel, resolve })),
    [],
  );

  const answer = (yes) => {
    question?.resolve(yes);
    setQuestion(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UIContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={t.out ? 'toast out' : 'toast'}>
            {t.text}
          </div>
        ))}
      </div>
      {question && (
        <Modal title="Are you sure?" onClose={() => answer(false)}>
          <div className="confirm">
            <p>{question.text}</p>
            <div className="btn-row">
              <button className="btn" type="button" onClick={() => answer(false)}>
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={() => answer(true)}>
                {question.okLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
