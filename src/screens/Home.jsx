import { useEffect, useRef, useState } from 'react';
import { dayNumber, encodeChallenge, isWord } from '../lib/wordle.js';
import { normCode } from '../lib/rooms.js';
import { shareMessage, shareOrCopy } from '../lib/share.js';
import { usePrefs } from '../prefs.jsx';
import { useUI } from '../components/UIProvider.jsx';

export function Home({ invited, onSolo, onCreate, onJoin }) {
  const { prefs, update, myName } = usePrefs();
  const { toast } = useUI();
  const nameRef = useRef(null);
  const joinRef = useRef(null);
  const [code, setCode] = useState(invited || '');
  const [word, setWord] = useState('');
  const [link, setLink] = useState('');

  // Arriving from an invite link: put the cursor where it's needed next.
  useEffect(() => {
    if (invited) (myName ? joinRef : nameRef).current?.focus();
  }, [invited]);

  const hasName = () => {
    if (myName) return true;
    toast('Enter your name first');
    nameRef.current?.focus();
    return false;
  };

  const join = (e) => {
    e.preventDefault();
    const c = normCode(code);
    if (c.length < 4) return toast('Enter the room code');
    if (hasName()) onJoin(c);
  };

  const makeLink = (e) => {
    e.preventDefault();
    const w = word.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(w)) return toast('Use exactly 5 letters');
    if (!isWord(w)) return toast('Not in word list');
    setLink(`${location.origin}${location.pathname}?c=${encodeChallenge(w, myName || 'A friend')}`);
  };

  const copyLink = async () => {
    const msg = shareMessage(await shareOrCopy(link, { title: 'Can you guess my word?', preferShare: true }));
    if (msg) toast(msg);
  };

  return (
    <section className="screen home">
      <div className="home-inner">
        <div className="hero" aria-hidden="true">
          {[['D', 'correct'], ['U', 'present'], ['E', 'absent'], ['T', 'correct']].map(([c, s]) => (
            <span key={c} className="tile" data-state={s}>
              {c}
            </span>
          ))}
        </div>
        <p className="tagline">Wordle for two. Team up, race, or send each other words.</p>

        {invited && (
          <div className="card invite">
            <strong>You're invited! 🎉</strong>
            <span>
              Pop your name in and tap <b>Join</b> to play in room <b>{invited}</b>.
            </span>
          </div>
        )}

        <label className="card">
          <span className="label">Your name</span>
          <input
            ref={nameRef}
            type="text"
            maxLength={20}
            autoComplete="nickname"
            spellCheck={false}
            placeholder="e.g. Sam"
            value={prefs.name}
            onChange={(e) => update({ name: e.target.value.slice(0, 20) })}
          />
        </label>

        <div className="card">
          <h2>Play together</h2>
          <button className="btn primary block" type="button" onClick={() => hasName() && onCreate()}>
            Create a room
          </button>
          <form className="inline-form" onSubmit={join}>
            <input
              className="code-input"
              type="text"
              maxLength={12}
              placeholder="Room code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Room code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button ref={joinRef} className="btn" type="submit">
              Join
            </button>
          </form>
          <p className="hint">Co-op, Race and Word Duel, with chat. Share the room link — no accounts needed.</p>
        </div>

        <div className="card">
          <h2>Play solo</h2>
          <div className="btn-row">
            <button className="btn" type="button" onClick={() => onSolo('daily')}>
              Daily <span className="muted">#{dayNumber()}</span>
            </button>
            <button className="btn" type="button" onClick={() => onSolo('unlimited')}>
              Unlimited
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Send a challenge</h2>
          <p className="hint">
            Pick a word and get a link. Whoever opens it tries to guess your word — you don't need to be online at the same time.
          </p>
          <form className="inline-form" onSubmit={makeLink}>
            <input
              className="code-input"
              type="text"
              maxLength={5}
              placeholder="5-letter word"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Challenge word"
              value={word}
              onChange={(e) => {
                setWord(e.target.value);
                setLink('');
              }}
            />
            <button className="btn" type="submit">
              Get link
            </button>
          </form>
          {link && (
            <div className="link-out">
              <input type="text" readOnly value={link} aria-label="Challenge link" onFocus={(e) => e.target.select()} />
              <button className="btn primary" type="button" onClick={copyLink}>
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
