import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LEN, ROWS, PRAISE, checkGuess, letterStates, randomAnswer } from '../lib/wordle.js';
import { MODES, boardOf, listNames, pickerFor, playerName } from '../lib/room.js';
import { Board } from '../components/Board.jsx';
import { Keyboard } from '../components/Keyboard.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useReveal } from '../hooks/useReveal.js';
import { useKeys } from '../hooks/useKeys.js';
import { useFitTiles } from '../hooks/useFitTiles.js';

const upper = (w) => (w || '').toUpperCase();

/** One round in a room (co-op, race or duel). Keyed by game id, so local state resets each round. */
export function Match({ snap, session }) {
  const { toast } = useUI();
  const s = snap.state;
  const g = s.game;
  const me = snap.me;
  // Names as they were when the round started, so results still read right if someone leaves.
  const name = (q) => g.names?.[q] || playerName(s, q);
  const coop = g.mode === 'coop';
  const picking = g.phase === 'pick';
  const playing = g.players.includes(me); // false if you joined a race or duel partway through
  const mine = playing ? boardOf(g, me) : coop ? g.board : null;
  const myCount = mine?.guesses.length ?? 0;
  const opps = coop ? [] : g.players.filter((q) => q !== me);
  const target = g.target?.[me]; // duel: who you pick a word for
  const picker = pickerFor(g, me); // duel: whose word you're guessing
  const myPick = snap.myPick?.gameId === g.id ? snap.myPick.word : '';

  // Row badges in co-op: initials, or two letters when two names start the same way.
  const badge = (q) => {
    const n = name(q);
    const people = new Set([...g.players, ...g.board.guesses.map((x) => x.by)]);
    const clash = [...people].some((o) => o !== q && name(o)[0]?.toUpperCase() === n[0]?.toUpperCase());
    return n.slice(0, clash ? 2 : 1).replace(/^./, (c) => c.toUpperCase());
  };

  const [draft, setDraft] = useState('');
  const [pick, setPick] = useState('');
  const [pending, setPending] = useState(null); // { count } after sending a guess, { pick: true } after picking
  const [fx, setFx] = useState({});
  const pendingRef = useRef(null);
  const turnToastAt = useRef(0);
  const celebrated = useRef(false);

  const rev = useReveal(myCount, g.id);
  const settled = rev.settled >= myCount;

  const setPendingNow = (p) => {
    pendingRef.current = p;
    setPending(p);
  };

  // The host applied our guess or pick: clear the input row.
  useLayoutEffect(() => {
    const p = pendingRef.current;
    if (!p) return;
    if (p.pick ? g.picked?.[me] : g.phase !== 'play' || myCount > p.count) {
      setPendingNow(null);
      if (p.pick) setPick('');
      else setDraft('');
    }
  }, [g, me, myCount]);

  // The host rejected it.
  useEffect(
    () =>
      session.on('error', () => {
        const p = pendingRef.current;
        if (!p) return;
        setPendingNow(null);
        setFx({ shake: { row: p.pick ? 0 : p.count } });
      }),
    [session],
  );

  // Don't stay stuck if a reply never arrives.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPendingNow(null), 6000);
    return () => clearTimeout(t);
  }, [pending]);

  // Celebrate when my board is solved (only if we saw it happen, not after a reload).
  useEffect(() => {
    if (!playing || picking || !mine.done || !settled || celebrated.current) return;
    celebrated.current = true;
    if (mine.won && rev.instant < myCount) {
      setFx({ bounce: { row: myCount - 1 } });
      toast(PRAISE[myCount - 1]);
    }
  }, [playing, picking, mine?.done, mine?.won, settled, myCount, rev.instant, toast]);

  function submitPick(word) {
    const err = checkGuess(word, [], false);
    if (err) {
      toast(err);
      setFx({ shake: { row: 0 } });
      return;
    }
    setPendingNow({ pick: true });
    session.pickWord(word);
  }

  function onKey(k) {
    if (pendingRef.current || !playing) return;
    if (picking) {
      if (g.picked[me]) return;
      if (k === 'enter') return submitPick(pick);
      setPick((p) => (k === 'back' ? p.slice(0, -1) : (p + k).slice(0, LEN)));
      return;
    }
    if (g.phase !== 'play' || mine.done || !settled) return;
    if (coop && g.turns && g.turn !== me) {
      if (Date.now() - turnToastAt.current > 1500) {
        turnToastAt.current = Date.now();
        toast(`It's ${name(g.turn)}'s turn`);
      }
      return;
    }
    if (k === 'enter') {
      const err = checkGuess(draft, mine.guesses, g.hard);
      if (err) {
        toast(err);
        setFx({ shake: { row: myCount } });
        return;
      }
      setPendingNow({ count: myCount });
      session.act({ type: 'guess', word: draft });
      return;
    }
    const next = k === 'back' ? draft.slice(0, -1) : (draft + k).slice(0, LEN);
    if (next === draft) return;
    setDraft(next);
    if (g.mode !== 'race') session.act({ type: 'draft', word: next }); // race keeps your letters private
  }
  useKeys(onKey);

  // In co-op the active row shows whoever is typing.
  let shown = draft;
  let ghost = false;
  if (coop && !mine.done) {
    const typist = g.turns
      ? g.turn !== me && g.turn
      : !draft && g.players.find((q) => q !== me && g.drafts?.[q]);
    if (typist || !playing) {
      shown = (typist && g.drafts?.[typist]) || '';
      ghost = true;
    }
  }

  const [title, sub] = statusText();
  function statusText() {
    const watching = "You're watching this one — you'll be in the next round";
    if (picking) {
      if (!playing) return ['Everyone is picking a secret word…', watching];
      if (!g.picked[me]) return [`Pick a secret word for ${name(target)}`, 'Type it and press Enter'];
      const waiting = g.players.filter((q) => !g.picked[q]).map(name);
      return [waiting.length ? `Waiting for ${listNames(waiting)} to pick…` : 'Starting…', `Your word for ${name(target)}: ${upper(myPick)}`];
    }
    if (g.phase === 'over') {
      if (!settled) return ['', ''];
      if (coop) {
        return [
          g.board.won ? `🎉 Solved together in ${myCount}/6!` : `The word was ${upper(g.answer)}`,
          `Co-op record: ${s.team.won}/${s.team.played} solved`,
        ];
      }
      const winners = g.winners || [];
      const others = winners.filter((q) => q !== me).map(name);
      let headline;
      if (!winners.length) headline = g.mode === 'race' ? 'Nobody got it' : "It's a draw";
      else if (winners.includes(me)) headline = others.length ? `🏆 You tie with ${listNames(others)}!` : '🏆 You win!';
      else headline = others.length > 1 ? `${listNames(others)} tie for the win` : `${others[0]} wins this one`;
      if (g.mode === 'race') return [headline, `The word was ${upper(g.answer)}`];
      // Duel: everyone's result. With just two players there's room for both words too.
      const withWords = g.players.length <= 2;
      const res = (q) => {
        const b = g.boards[q];
        const r = `${b.won ? b.guesses.length : 'X'}/6`;
        return q === me || withWords ? `${r} on ${upper(g.answers[q])}` : r;
      };
      const parts = g.players.map((q) => `${q === me ? 'You' : name(q)}: ${res(q)}`);
      if (playing) parts.unshift(...parts.splice(g.players.indexOf(me), 1));
      return [headline, parts.join(' · ')];
    }
    if (!playing) return [`${MODES[g.mode].name} in progress`, watching];

    const finished = mine.done && settled; // don't give the result away mid-flip
    if (coop) {
      const typing = g.players.filter((q) => q !== me && g.drafts?.[q] && (!g.turns || q === g.turn)).map(name);
      const typingText = typing.length ? `${listNames(typing)} ${typing.length > 1 ? 'are' : 'is'} typing…` : '';
      const n = `Guess ${Math.min(myCount + 1, ROWS)} of ${ROWS}`;
      if (!g.turns) return ['Solve it together', typingText || `${n} · anyone can guess`];
      return g.turn === me ? ['Your turn', n] : [`${name(g.turn)}'s turn`, typingText || n];
    }
    const still = opps.filter((q) => !g.boards[q].done).map(name);
    if (g.mode === 'race') {
      return finished
        ? ['Out of guesses 😬', `${listNames(still)} can still win it…`]
        : [
            'Race! First to solve it wins',
            `${opps.length > 1 ? 'Same word for everyone · their letters are hidden' : 'Same word for both of you'}${g.hard ? ' · hard mode' : ''}`,
          ];
    }
    if (finished) return [mine.won ? `Solved in ${myCount}!` : 'Out of guesses', `Waiting for ${listNames(still)} to finish…`];
    const typing = opps.length === 1 && g.drafts?.[target] ? `${name(target)} is typing…` : '';
    return [`Guess ${name(picker)}'s word`, typing || 'Fewest guesses wins'];
  }

  const kbDisabled =
    !playing || (picking ? !!g.picked[me] : g.phase !== 'play' || mine.done || (coop && g.turns && g.turn !== me));

  // A line under each of the other boards. With several boards they're narrow, so keep it short.
  const solo = opps.length === 1;
  const noteFor = (q) => {
    const over = g.phase === 'over';
    if (picking) return '';
    if (g.mode === 'race') return solo && !over ? 'letters hidden' : ''; // with more, the status line says so
    if (solo && q === target) return `guessing your word${myPick || over ? ` ${upper(over ? g.answers[q] : myPick)}` : ''}`;
    if (over) return `on ${upper(g.answers[q])}`;
    return q === target ? 'on your word' : `on ${name(pickerFor(g, q))}'s word`;
  };
  const notes = opps.some((q) => noteFor(q));
  const fitRef = useFitTiles({ opps: opps.length, badges: coop, mine: !!mine, notes });

  // Someone else's board, small, beside yours.
  const oppBoard = (q) => {
    const b = g.boards[q];
    const over = g.phase === 'over';
    const label = picking ? (g.picked[q] ? 'ready' : 'picking…') : b.won ? '✓' : b.done ? '✗' : `${b.guesses.length}/6`;
    const note = noteFor(q);
    return (
      <div key={q} className={g.mode === 'race' && !over ? 'opp hide-letters' : 'opp'} data-p={q}>
        <div className="opp-name">
          <i className="dot" />
          <span className="n">{name(q)}</span>
          <span>· {label}</span>
        </div>
        <Board guesses={b.guesses} draft={g.mode === 'duel' && !b.done ? g.drafts?.[q] || '' : ''} ghost />
        {note && <div className="opp-note">{note}</div>}
      </div>
    );
  };

  return (
    <div className="match">
      <div className="status-line">
        <div className="status-text">
          <strong>{title}</strong>
          {sub && <span>{sub}</span>}
        </div>
      </div>

      {picking && playing ? (
        <div className="pick-area">
          <Board rows={1} guesses={[]} draft={g.picked[me] ? myPick : pick} shake={fx.shake} />
          {!g.picked[me] && (
            <button
              className="btn small"
              type="button"
              onClick={() => {
                const w = randomAnswer();
                setPick(w);
                submitPick(w);
              }}
            >
              🎲 Random word
            </button>
          )}
        </div>
      ) : (
        <div className="boards-wrap" ref={fitRef}>
          {mine && (
            <Board
              guesses={mine.guesses}
              draft={mine.done ? '' : shown}
              ghost={ghost}
              instant={rev.instant}
              badge={coop ? badge : undefined}
              shake={fx.shake}
              bounce={fx.bounce}
            />
          )}
          {opps.length > 0 && <div className="opps">{opps.map(oppBoard)}</div>}
        </div>
      )}

      <div className="kb-area">
        {g.phase === 'over' && settled ? (
          <div className="result-card">
            <div className="btn-row">
              <button className="btn primary" type="button" onClick={() => session.act({ type: 'start', mode: g.mode })}>
                Play again
              </button>
              <button className="btn" type="button" onClick={() => session.act({ type: 'lobby' })}>
                Change game
              </button>
            </div>
            <p className="hint">Anyone can start the next round.</p>
          </div>
        ) : !playing ? (
          <div className="result-card">
            <p className="hint">You joined partway through, so you're watching this round. You'll be in the next one.</p>
          </div>
        ) : (
          <Keyboard states={picking ? {} : letterStates(mine.guesses.slice(0, rev.settled))} onKey={onKey} disabled={kbDisabled} />
        )}
      </div>
    </div>
  );
}
