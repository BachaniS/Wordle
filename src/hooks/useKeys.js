import { useEffect, useEffectEvent } from 'react';

/** Send physical-keyboard letters, Enter and Backspace to the game as 'a'…'z', 'enter', 'back'. */
export function useKeys(onKey, enabled = true) {
  const handle = useEffectEvent(onKey);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Enter' && t?.closest('button, a')) return; // let focused buttons work
      const k = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' ? 'back' : /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : null;
      if (!k) return;
      e.preventDefault();
      handle(k);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
