import { useEffect, useState } from 'react';
import { Header } from './components/Header.jsx';
import { Modal } from './components/Modal.jsx';
import { HelpPanel, SettingsPanel, StatsPanel } from './components/Panels.jsx';
import { useUI } from './components/UIProvider.jsx';
import { useRoom } from './hooks/useRoom.js';
import { decodeChallenge } from './lib/wordle.js';
import { normCode, rooms } from './lib/rooms.js';
import { local } from './lib/storage.js';
import { usePrefs } from './prefs.jsx';
import { Home } from './screens/Home.jsx';
import { RoomScreen } from './screens/Room.jsx';
import { Solo } from './screens/Solo.jsx';

const PANELS = {
  help: ['How to play', HelpPanel],
  stats: ['Statistics', StatsPanel],
  settings: ['Settings', SettingsPanel],
};

const clearUrl = () => history.replaceState(null, '', location.pathname);

/** What to show on first load, based on ?c=<challenge> or ?room=<code> in the URL. */
function initialView() {
  const params = new URLSearchParams(location.search);
  if (params.get('c')) {
    const challenge = decodeChallenge(params.get('c'));
    if (challenge) return { screen: 'solo', start: { kind: 'challenge', challenge } };
    return { screen: 'home', brokenLink: true };
  }
  return { screen: 'home', invited: normCode(params.get('room')) || null };
}

export default function App() {
  const room = useRoom();
  const { myName } = usePrefs();
  const { toast, confirm } = useUI();
  const [view, setView] = useState(initialView);
  const [soloRun, setSoloRun] = useState(0);
  const [panel, setPanel] = useState(() =>
    !room && view.screen === 'home' && !view.invited && !local.get('wt-seen-help', false) ? 'help' : null,
  );

  useEffect(() => {
    if (panel === 'help') local.set('wt-seen-help', true);
  }, [panel]);

  useEffect(() => {
    if (view.brokenLink) toast('That challenge link looks broken', 3000);
  }, [view.brokenLink, toast]);

  useEffect(
    () =>
      rooms.onClosed((hostName) => {
        toast(`${hostName} closed the room`, 2500);
        setView({ screen: 'home' });
      }),
    [toast],
  );

  const goHome = () => {
    clearUrl();
    setView({ screen: 'home' });
  };

  const startSolo = (kind) => {
    setView({ screen: 'solo', start: { kind } });
    setSoloRun((n) => n + 1);
  };

  const enterRoom = (code) => {
    clearUrl();
    setView({ screen: 'home' }); // what to show after leaving the room
    if (code) rooms.join(code, myName);
    else rooms.create(myName);
  };

  const leaveRoom = async (ask = true) => {
    if (ask && !(await confirm('Leave this room? You can always make a new one.', 'Leave'))) return;
    rooms.leave();
    goHome();
  };

  const screen = room ? 'room' : view.screen;
  const [panelTitle, PanelBody] = PANELS[panel] || [];

  return (
    <>
      <Header showBack={screen !== 'home'} onBack={() => (screen === 'room' ? leaveRoom(true) : goHome())} onPanel={setPanel} />
      <main>
        {screen === 'room' && <RoomScreen key={`${room.role}-${room.code}`} snap={room} onLeave={leaveRoom} />}
        {screen === 'solo' && <Solo key={soloRun} start={view.start} />}
        {screen === 'home' && <Home invited={view.invited} onSolo={startSolo} onCreate={() => enterRoom()} onJoin={enterRoom} />}
      </main>
      {PanelBody && (
        <Modal title={panelTitle} onClose={() => setPanel(null)}>
          <PanelBody />
        </Modal>
      )}
    </>
  );
}
