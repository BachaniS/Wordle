import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { local } from './lib/storage.js';
import { cleanName } from './lib/room.js';

const DEFAULTS = { name: '', theme: 'system', contrast: false, hard: false };

export const loadPrefs = () => ({ ...DEFAULTS, ...local.get('wt-prefs', {}) });

export function applyTheme({ theme, contrast }) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  root.classList.toggle('contrast', !!contrast);
}

const PrefsContext = createContext(null);

export function PrefsProvider({ initial, children }) {
  const [prefs, setPrefs] = useState(initial);

  useLayoutEffect(() => {
    local.set('wt-prefs', prefs);
    applyTheme(prefs);
  }, [prefs]);

  const update = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), []);
  const value = useMemo(() => ({ prefs, update, myName: cleanName(prefs.name) }), [prefs, update]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
