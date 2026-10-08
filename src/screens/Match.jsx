import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LEN, ROWS, PRAISE, checkGuess, letterStates, randomAnswer } from '../lib/wordle.js';
import { boardOf, other } from '../lib/room.js';
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
  const me = snap.role;
  const them = other(me);
  const name = (q) => s.players[q]?.name || (q === 'A' ? 'Host' : 'Guest');
  // Row badges in co-op: initials, or two letters when both names start the same way.
  const badge = (q) => {
    const n = name(q)[0]?.toUpperCase() === name(other(q))[0]?.toUpperCase() ? 2 : 1;
    return name(q).slice(0, n).replace(/^./, (c) => c.toUpperCase());
  };
  const coop = g.mode === 'coop';
  const picking = g.phase === 'pick';
  const mine = boardOf(g, me);
  const myCount = mine.guesses.length;
  const myPick = snap.myPick?.gameId === g.id ? snap.myPick.word : '';

  const [draft, setDraft] = useState('');
  const [pick, setPick] = useState('');
  const [pending, setPending] = useState(null); // { count } after sending a guess, { pick: true } after picking
  const [fx, setFx] = useState({});
  const pendingRef = useRef(null);
  const turnToastAt = useRef(0);
  const celebrated = useRef(false);
  const fitRef = useFitTiles({ withOpp: !coop, badges: coop });

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
    if (picking || !mine.done || !settled || celebrated.current) return;
    celebrated.current = true;
    if (mine.won && rev.instant < myCount) {
      setFx({ bounce: { row: myCount - 1 } });
      toast(PRAISE[myCount - 1]);
    }
  }, [picking, mine.done, mine.won, settled, myCount, rev.instant, toast]);

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
    if (pendingRef.current) return;
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
    const theirs = g.drafts?.[them] || '';
    if (g.turns ? g.turn === them : !draft && theirs) {
      shown = theirs;
      ghost = true;
    }
  }

  const [title, sub] = statusText();
  function statusText() {
    if (picking) {
      return g.picked[me]
        ? [`Waiting for ${name(them)} to pick…`, `Your word for ${name(them)}: ${upper(myPick)}`]
        : [`Pick a secret word for ${name(them)}`, 'Type it and press Enter'];
    }
    if (g.phase === 'over') {
      if (!settled) return ['', ''];
      if (coop) {
        return [
          g.board.won ? `🎉 Solved together in ${myCount}/6!` : `The word was ${upper(g.answer)}`,
          `Co-op record: ${s.team.won}/${s.team.played} solved`,
        ];
      }
      const headline = g.winner === me ? '🏆 You win!' : g.winner === them ? `${name(them)} wins this one` : "It's a draw";
      if (g.mode === 'race') return [headline, `The word was ${upper(g.answer)}`];
      const res = (q) => `${g.boards[q].won ? g.boards[q].guesses.length : 'X'}/6 on ${upper(g.answers[q])}`;
      return [headline, `You: ${res(me)} · ${name(them)}: ${res(them)}`];
    }
    const typing = g.drafts?.[them] ? `${name(them)} is typing…` : '';
    const finished = mine.done && settled; // don't give the result away mid-flip
    if (coop) {
      const n = `Guess ${Math.min(myCount + 1, ROWS)} of ${ROWS}`;
      if (!g.turns) return ['Solve it together', typing || `${n} · anyone can guess`];
      return g.turn === me ? ['Your turn', n] : [`${name(them)}'s turn`, typing || n];
    }
    if (g.mode === 'race') {
      return finished
        ? ['Out of guesses 😬', `${name(them)} can still win it…`]
        : ['Race! First to solve it wins', `Same word for both of you${g.hard ? ' · hard mode' : ''}`];
    }
    if (finished) return [mine.won ? `Solved in ${myCount}!` : 'Out of guesses', `Waiting for ${name(them)} to finish…`];
    return [`Guess ${name(them)}'s word`, typing || 'Fewest guesses wins'];
  }

  const theirs = coop ? null : g.boards[them];
  const kbDisabled = picking ? !!g.picked[me] : g.phase !== 'play' || mine.done || (coop && g.turns && g.turn !== me);

  return (
    <div className="match">
      <div className="status-line">
        <div className="status-text">
          <strong>{title}</strong>
          {sub && <span>{sub}</span>}
        </div>
      </div>

      {picking ? (
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
          <Board
            guesses={mine.guesses}
            draft={mine.done ? '' : shown}
            ghost={ghost}
            instant={rev.instant}
            badge={coop ? badge : undefined}
            shake={fx.shake}
            bounce={fx.bounce}
          />
          {theirs && (
            <div className={g.mode === 'race' && g.phase !== 'over' ? 'opp hide-letters' : 'opp'}>
              <div className="opp-name">
                {name(them)} · {theirs.won ? '✓' : theirs.done ? '✗' : `${theirs.guesses.length}/6`}
              </div>
              <Board guesses={theirs.guesses} draft={g.mode === 'duel' && !theirs.done ? g.drafts?.[them] || '' : ''} ghost />
              <div className="opp-note">
                {g.mode === 'duel' && myPick ? `guessing your word ${upper(myPick)}` : g.mode === 'race' && g.phase !== 'over' ? 'letters hidden' : ''}
              </div>
            </div>
          )}
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
            <p className="hint">Either of you can start the next round.</p>
          </div>
        ) : (
          <Keyboard states={picking ? {} : letterStates(mine.guesses.slice(0, rev.settled))} onKey={onKey} disabled={kbDisabled} />
        )}
      </div>
    </div>
  );
}
