import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { UIProvider } from './components/UIProvider.jsx';
import { rooms } from './lib/rooms.js';
import { PrefsProvider, applyTheme, loadPrefs } from './prefs.jsx';
import './styles.css';

const prefs = loadPrefs();
applyTheme(prefs);

// After a reload, drop back into the room this tab was in — unless the URL is a challenge
// link or an invite to a different room.
const params = new URLSearchParams(location.search);
if (!params.get('c')) rooms.resume(prefs.name.trim(), params.get('room'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrefsProvider initial={prefs}>
      <UIProvider>
        <App />
      </UIProvider>
    </PrefsProvider>
  </StrictMode>,
);
