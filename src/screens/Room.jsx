import { useCallback, useEffect, useState } from 'react';
import { MODES, MAX_PLAYERS, listNames, playerName, seated } from '../lib/room.js';
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
  full: 'Room full',
  replaced: 'Open in another tab',
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

  const me = snap.me;
  const s = me ? snap.state : null;
  const seats = s ? seated(s) : [];
  const name = (q) => playerName(s, q);
  const connected = snap.status === 'connected';
  const isOnline = (q) => (q === me ? connected || (snap.host && snap.status === 'waiting') : connected && !!s?.players[q]?.online);
  const othersHere = seats.some((q) => q !== me && isOnline(q));
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
    if (String(text).trim()) toast(othersHere ? 'Not connected — message not sent' : 'Nobody here yet to chat with');
    return false;
  };

  const toLobby = async () => {
    if (s.game.phase !== 'over' && !(await confirm('End this round for everyone and go back to the lobby?', 'End round'))) return;
    session.act({ type: 'lobby' });
  };

  const removePlayer = async (q) => {
    if (await confirm(`Remove ${name(q)} from the room? Their seat opens up for someone new.`, 'Remove')) {
      session.act({ type: 'kick', seat: q });
    }
  };

  // With two players: "Ann (you) vs Ben". With more, your own chip just says "You".
  const crowd = seats.length > 2;
  const chip = (q) => (
    <span key={q} className={`pchip${isOnline(q) ? '' : ' offline'}${q === me ? ' me' : ''}`} data-p={q}>
      <i className="dot" />
      <b className="pname">{q !== me ? name(q) : crowd ? 'You' : `${name(q)} (you)`}</b>
      <span className="pscore">{s.scores[q] ?? 0}</span>
      {snap.host && q !== me && !s.players[q].online && (
        <button className="chip-x" type="button" aria-label={`Remove ${name(q)}`} title="Remove from room" onClick={() => removePlayer(q)}>
          ×
        </button>
      )}
    </span>
  );

  return (
    <section className="screen room">
      <div className="game-col">
        <div className="room-head">
          <div className="scoreboard" title={s?.scores.draws ? `${s.scores.draws} draw${s.scores.draws > 1 ? 's' : ''}` : undefined}>
            {seats.length === 2 ? (
              <>
                {chip(me)}
                <span className="vs">vs</span>
                {chip(seats.find((q) => q !== me))}
              </>
            ) : (
              seats.map(chip)
            )}
            {seats.length === 1 && (
              <span className="pchip offline">
                <i className="dot" />
                <b className="pname">Waiting…</b>
              </span>
            )}
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

        <ConnBanner snap={snap} s={s} name={name} onCancel={() => onLeave(false)} />

        {s && !s.game && <Lobby snap={snap} session={session} othersHere={othersHere} onLeave={() => onLeave(true)} />}
        {s?.game && <Match key={s.game.id} snap={snap} session={session} />}
      </div>

      <Chat
        chat={snap.chat}
        me={me}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={send}
        conn={{
          label: !snap.host && snap.status === 'waiting' ? CONN_LABELS.connecting : CONN_LABELS[snap.status],
          state: connected ? 'ok' : snap.status === 'waiting' && snap.host ? 'idle' : 'warn',
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

function ConnBanner({ snap, s, name, onCancel }) {
  const st = snap.status;
  let msg = null;
  let action = null;
  if (st === 'full' || st === 'replaced') {
    msg = snap.error;
    action = 'Leave';
  } else if (snap.error) {
    msg = snap.error;
  } else if (!snap.host) {
    if (st === 'searching') {
      msg = `Looking for room ${snap.code}… Make sure the host has it open and the code is right.`;
      action = 'Cancel';
    } else if (!s && (st === 'connecting' || st === 'connected')) {
      msg = `Joining room ${snap.code}…`;
      action = 'Cancel';
    } else if (st === 'reconnecting') {
      msg = 'Connection lost — reconnecting…';
    }
  } else if (st === 'taken') {
    msg = `Couldn't reopen room ${snap.code}. Leave and create a new room.`;
    action = 'Leave';
  } else if (st === 'connecting' || st === 'reconnecting') {
    msg = s && seated(s).length > 1 ? 'Reconnecting to the server…' : 'Opening room…';
  }
  if (!msg && s) {
    const gone = seated(s).filter((q) => q !== snap.me && !s.players[q].online && s.players[q].name);
    if (gone.length) {
      msg = `${listNames(gone.map(name))} disconnected — they can rejoin any time.`;
      if (snap.host) msg += ` Tap × by ${gone.length > 1 ? 'a name' : 'their name'} to free up the seat.`;
    }
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

function Lobby({ snap, session, othersHere, onLeave }) {
  const { toast } = useUI();
  const s = snap.state;
  const count = seated(s).length;

  const copyInvite = async () => {
    const url = `${location.origin}${location.pathname}?room=${snap.code}`;
    const msg = shareMessage(await shareOrCopy(url, { title: 'Play Wordle with me', preferShare: true }));
    if (msg) toast(msg);
  };
  const setOpt = (patch) => session.act({ type: 'opts', opts: { ...s.opts, ...patch } });
  const record = s.team.played ? ` Co-op record: ${s.team.won}/${s.team.played} solved.` : '';

  return (
    <div className="lobby">
      {snap.host && !othersHere && (
        <div className="card invite-card">
          <h2>Invite your friends</h2>
          <p className="hint">
            Send them this link (or the code). Up to {MAX_PLAYERS} can play, and you can pick a game as soon as one person joins.
          </p>
          <div className="room-code">{snap.code}</div>
          <button className="btn primary" type="button" onClick={copyInvite}>
            Copy invite link
          </button>
        </div>
      )}

      <h2 className="lobby-title">Pick a game</h2>
      <div className="mode-grid">
        {Object.entries(MODES).map(([mode, info]) => (
          <button key={mode} className="mode-card" type="button" disabled={!othersHere} onClick={() => session.act({ type: 'start', mode })}>
            <span className="mode-icon">{info.icon}</span>
            <b>{info.name}</b>
            <small>{info.blurb}</small>
          </button>
        ))}
      </div>
      <div className="opts">
        <Switch checked={s.opts.hard} disabled={!othersHere} onChange={(hard) => setOpt({ hard })}>
          Hard mode
        </Switch>
        <Switch checked={s.opts.turns} disabled={!othersHere} onChange={(turns) => setOpt({ turns })}>
          Co-op: take turns
        </Switch>
      </div>
      <p className="hint center">
        {othersHere
          ? `Anyone can pick — it starts for everyone who's here.${record}`
          : snap.host
            ? 'Waiting for someone to join…'
            : 'Waiting for the host…'}
      </p>
      <p className="room-meta">
        Room <b>{snap.code}</b> · {count}/{MAX_PLAYERS} players ·{' '}
        {count < MAX_PLAYERS && (snap.host ? othersHere : true) && (
          <>
            <button className="linkish" type="button" onClick={copyInvite}>
              Invite
            </button>{' '}
            ·{' '}
          </>
        )}
        <button className="linkish" type="button" onClick={onLeave}>
          Leave room
        </button>
      </p>
    </div>
  );
}
