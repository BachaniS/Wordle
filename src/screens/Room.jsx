import { useCallback, useEffect, useState } from 'react';
import { MODES, other } from '../lib/room.js';
import { rooms } from '../lib/rooms.js';
import { shareMessage, shareOrCopy } from '../lib/share.js';
import { Chat } from '../components/Chat.jsx';
import { ChatIcon } from '../components/Icons.jsx';
import { Switch } from '../components/Switch.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { Match } from './Match.jsx';

const CONN_LABELS = {
  connecting: 'Connecting…',
  waiting: 'Room open',
  searching: 'Looking for room…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  taken: 'Room unavailable',
  error: 'Offline',
};

export function RoomScreen({ snap, onLeave }) {
  const session = rooms.current;
  const { toast, confirm } = useUI();
  const wide = useMediaQuery('(min-width: 1000px)');
  const [chatOpen, setChatOpen] = useState(false);
  const chatVisible = wide || chatOpen;
  const [readUpTo, setReadUpTo] = useState(() => snap.chat.at(-1)?.id ?? 0);
  const [floaters, setFloaters] = useState([]);

  const s = snap.state;
  const me = snap.role;
  const them = other(me);
  const name = (q) => s?.players[q]?.name || (q === 'A' ? 'Host' : 'Guest');
  const partnerHere = snap.status === 'connected' && !!s?.players[them]?.online;
  const lastId = snap.chat.at(-1)?.id ?? 0;

  useEffect(() => {
    if (chatVisible) setReadUpTo(lastId);
  }, [chatVisible, lastId]);
  const unread = chatVisible ? 0 : snap.chat.filter((m) => m.id > readUpTo && !m.sys && m.from !== me).length;

  const float = useCallback((text) => {
    const id = Math.random();
    setFloaters((f) => [...f, { id, text, left: 15 + Math.random() * 70 }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2200);
  }, []);

  useEffect(() => session.on('error', (text) => toast(text)), [session, toast]);
  useEffect(
    () =>
      session.on('chat', (m) => {
        if (m.react) float(m.text);
        else if (!chatVisible) toast(`${m.name}: ${m.text}`, 2600);
      }),
    [session, chatVisible, toast, float],
  );

  const send = (text, react = false) => {
    if (session.sendChat(text, react)) {
      if (react) float(text);
      return true;
    }
    if (String(text).trim()) toast(partnerHere ? 'Not connected — message not sent' : 'Nobody here yet to chat with');
    return false;
  };

  const toLobby = async () => {
    if (s.game.phase !== 'over' && !(await confirm('End this round for both of you and go back to the lobby?', 'End round'))) return;
    session.act({ type: 'lobby' });
  };

  const chip = (q) => {
    const online = q === me ? snap.status === 'connected' || (me === 'A' && snap.status === 'waiting') : partnerHere;
    return (
      <span className={online ? 'pchip' : 'pchip offline'} data-p={q}>
        <i className="dot" />
        <b className="pname">{q === me ? `${name(q)} (you)` : s?.players[q]?.name || 'Waiting…'}</b>
        <span className="pscore">{s?.scores[q] ?? 0}</span>
      </span>
    );
  };

  return (
    <section className="screen room">
      <div className="game-col">
        <div className="room-head">
          <div className="scoreboard" title={s?.scores.draws ? `${s.scores.draws} draw${s.scores.draws > 1 ? 's' : ''}` : undefined}>
            {chip(me)}
            <span className="vs">vs</span>
            {chip(them)}
          </div>
          <div className="room-actions">
            {s?.game && (
              <button className="btn small" type="button" onClick={toLobby}>
                Lobby
              </button>
            )}
            <button className="icon-btn chat-toggle" type="button" aria-label="Open chat" onClick={() => setChatOpen((o) => !o)}>
              <ChatIcon />
              {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
        </div>

        <ConnBanner snap={snap} partner={s?.players[them]} onCancel={() => onLeave(false)} />

        {s && !s.game && <Lobby snap={snap} session={session} partnerHere={partnerHere} onLeave={() => onLeave(true)} />}
        {s?.game && <Match key={s.game.id} snap={snap} session={session} />}
      </div>

      <Chat
        chat={snap.chat}
        me={me}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={send}
        conn={{
          label: me === 'B' && snap.status === 'waiting' ? CONN_LABELS.connecting : CONN_LABELS[snap.status],
          state: snap.status === 'connected' ? 'ok' : snap.status === 'waiting' && me === 'A' ? 'idle' : 'warn',
        }}
      />

      <div className="floaters" aria-hidden="true">
        {floaters.map((f) => (
          <span key={f.id} className="floater" style={{ left: `${f.left}%` }}>
            {f.text}
          </span>
        ))}
      </div>
    </section>
  );
}

function ConnBanner({ snap, partner, onCancel }) {
  const st = snap.status;
  let msg = null;
  let action = null;
  if (snap.error) {
    msg = snap.error;
  } else if (snap.role === 'B') {
    if (st === 'searching') {
      msg = `Looking for room ${snap.code}… Make sure your partner has it open and the code is right.`;
      action = 'Cancel';
    } else if (!snap.state && (st === 'connecting' || st === 'connected')) {
      msg = `Joining room ${snap.code}…`;
      action = 'Cancel';
    } else if (st === 'reconnecting') {
      msg = 'Connection lost — reconnecting…';
    }
  } else if (st === 'taken') {
    msg = `Couldn't reopen room ${snap.code}. Leave and create a new room.`;
    action = 'Leave';
  } else if (st === 'connecting' || st === 'reconnecting') {
    msg = snap.state?.players.B.name ? 'Reconnecting to the server…' : 'Opening room…';
  } else if (partner?.name && !partner.online) {
    msg = `${partner.name} disconnected — the game will carry on when they're back.`;
  }
  if (!msg) return null;
  return (
    <div className="conn-banner" role="status">
      <span>{msg}</span>
      {action && (
        <button className="btn small" type="button" onClick={onCancel}>
          {action}
        </button>
      )}
    </div>
  );
}

function Lobby({ snap, session, partnerHere, onLeave }) {
  const { toast } = useUI();
  const s = snap.state;

  const copyInvite = async () => {
    const url = `${location.origin}${location.pathname}?room=${snap.code}`;
    const msg = shareMessage(await shareOrCopy(url, { title: 'Play Wordle with me', preferShare: true }));
    if (msg) toast(msg);
  };
  const setOpt = (patch) => session.act({ type: 'opts', opts: { ...s.opts, ...patch } });
  const record = s.team.played ? ` Co-op record: ${s.team.won}/${s.team.played} solved.` : '';

  return (
    <div className="lobby">
      {snap.role === 'A' && !partnerHere && (
        <div className="card invite-card">
          <h2>Invite your partner</h2>
          <p className="hint">Send them this link (or the code). You can pick a game once they join.</p>
          <div className="room-code">{snap.code}</div>
          <button className="btn primary" type="button" onClick={copyInvite}>
            Copy invite link
          </button>
        </div>
      )}

      <h2 className="lobby-title">Pick a game</h2>
      <div className="mode-grid">
        {Object.entries(MODES).map(([mode, info]) => (
          <button key={mode} className="mode-card" type="button" disabled={!partnerHere} onClick={() => session.act({ type: 'start', mode })}>
            <span className="mode-icon">{info.icon}</span>
            <b>{info.name}</b>
            <small>{info.blurb}</small>
          </button>
        ))}
      </div>
      <div className="opts">
        <Switch checked={s.opts.hard} disabled={!partnerHere} onChange={(hard) => setOpt({ hard })}>
          Hard mode
        </Switch>
        <Switch checked={s.opts.turns} disabled={!partnerHere} onChange={(turns) => setOpt({ turns })}>
          Co-op: take turns
        </Switch>
      </div>
      <p className="hint center">
        {partnerHere
          ? `Either of you can pick — it starts for both.${record}`
          : snap.role === 'A'
            ? 'Waiting for your partner to join…'
            : 'Waiting for the host…'}
      </p>
      <p className="room-meta">
        Room <b>{snap.code}</b> ·{' '}
        <button className="linkish" type="button" onClick={onLeave}>
          Leave room
        </button>
      </p>
    </div>
  );
}
