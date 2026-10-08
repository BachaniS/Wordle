import { useEffect, useState } from 'react';
import {
  LEN, ROWS, PRAISE, checkGuess, score, letterStates, randomAnswer, dailyAnswer, dayNumber, msUntilTomorrow, emojiGrid,
} from '../lib/wordle.js';
import { local, recordResult } from '../lib/storage.js';
import { shareMessage, shareOrCopy } from '../lib/share.js';
import { Board } from '../components/Board.jsx';
import { Keyboard } from '../components/Keyboard.jsx';
import { Modal } from '../components/Modal.jsx';
import { StatsPanel } from '../components/Panels.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useReveal } from '../hooks/useReveal.js';
import { useKeys } from '../hooks/useKeys.js';
import { useFitTiles } from '../hooks/useFitTiles.js';
import { usePrefs } from '../prefs.jsx';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function newUnlimited(hard) {
  return { id: newId(), kind: 'unlimited', guesses: [], hard, status: 'playing', answer: randomAnswer() };
}

/** Resume today's daily / an unfinished unlimited word, or start fresh. */
function loadGame(start, hard) {
  if (start.kind === 'daily') {
    const day = dayNumber();
    const saved = local.get('wt-solo-daily', null);
    if (saved?.day === day && saved.id) return saved;
    return { id: newId(), kind: 'daily', day, answer: dailyAnswer(day), guesses: [], hard, status: 'playing' };
  }
  if (start.kind === 'unlimited') {
    const saved = local.get('wt-solo-unlimited', null);
    return saved?.status === 'playing' && saved.id ? saved : newUnlimited(hard);
  }
  const { word, from } = start.challenge;
  return { id: newId(), kind: 'challenge', answer: word, from, guesses: [], hard, status: 'playing' };
}

function shareText(g, contrast) {
  const head = g.kind === 'daily' ? `Wordle Together #${g.day}` : g.kind === 'challenge' ? `Your word challenge, ${g.from}:` : 'Wordle Together';
  return `${head} ${g.status === 'won' ? g.guesses.length : 'X'}/6${g.hard ? '*' : ''}\n\n${emojiGrid(g.guesses, contrast)}`;
}

function Countdown() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor(msUntilTomorrow() / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return <p className="countdown">Next daily in {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</p>;
}

export function Solo({ start }) {
  const { prefs } = usePrefs();
  const { toast, confirm } = useUI();
  const [game, setGame] = useState(() => loadGame(start, prefs.hard));
  const [draft, setDraft] = useState('');
  const [fx, setFx] = useState({});
  const [finishedNow, setFinishedNow] = useState(null); // id of a game finished during this visit
  const [showResult, setShowResult] = useState(false);
  const fitRef = useFitTiles();

  const rev = useReveal(game.guesses.length, game.id);
  const done = game.status !== 'playing';
  const settled = rev.settled >= game.guesses.length;
  const won = game.status === 'won';

  useEffect(() => {
    if (game.kind !== 'challenge') local.set(`wt-solo-${game.kind}`, game);
  }, [game]);

  // The hard-mode setting applies to a word that hasn't been started yet.
  useEffect(() => {
    setGame((g) => (g.status === 'playing' && !g.guesses.length && g.hard !== prefs.hard ? { ...g, hard: prefs.hard } : g));
  }, [prefs.hard]);

  // Once the last row has flipped: celebrate (if it just happened), then show the results.
  useEffect(() => {
    if (!done || !settled) return;
    const live = finishedNow === game.id;
    if (live && won) {
      setFx({ bounce: { row: game.guesses.length - 1 } });
      toast(PRAISE[game.guesses.length - 1]);
    } else if (live) {
      toast(game.answer.toUpperCase(), 2500);
    }
    const t = setTimeout(() => setShowResult(true), live ? 1600 : 350);
    return () => clearTimeout(t);
  }, [done, settled, won, finishedNow, game.id, game.guesses.length, game.answer, toast]);

  function submit() {
    const err = checkGuess(draft, game.guesses, game.hard);
    if (err) {
      toast(err);
      setFx({ shake: { row: game.guesses.length } });
      return;
    }
    const guesses = [...game.guesses, { word: draft, result: score(draft, game.answer) }];
    const status = draft === game.answer ? 'won' : guesses.length >= ROWS ? 'lost' : 'playing';
    if (status !== 'playing') {
      recordResult(status === 'won', guesses.length);
      setFinishedNow(game.id);
    }
    setGame({ ...game, guesses, status });
    setDraft('');
  }

  function onKey(k) {
    if (done || !settled) return;
    if (k === 'enter') return submit();
    setDraft((d) => (k === 'back' ? d.slice(0, -1) : (d + k).slice(0, LEN)));
  }
  useKeys(onKey);

  async function nextWord() {
    if (game.kind === 'unlimited' && !done && game.guesses.length) {
      if (!(await confirm('Skip this word? It will count as a loss.', 'Skip'))) return;
      recordResult(false);
    }
    setShowResult(false);
    setDraft('');
    setGame(game.kind === 'unlimited' ? newUnlimited(prefs.hard) : loadGame({ kind: 'unlimited' }, prefs.hard));
  }

  async function share() {
    const msg = shareMessage(await shareOrCopy(shareText(game, prefs.contrast), { preferShare: true }));
    if (msg) toast(msg);
  }

  const label = game.kind === 'daily' ? `Daily #${game.day}` : game.kind === 'unlimited' ? 'Unlimited' : `Challenge from ${game.from}`;
  const nextLabel = game.kind === 'unlimited' ? (done ? 'Next word' : 'New word') : 'Play unlimited';
  const canNext = game.kind === 'unlimited' || (game.kind === 'challenge' && done);

  return (
    <section className="screen game-screen">
      <div className="game-col">
        <div className="status-line">
          <strong>{label}</strong>
          {game.hard && <span className="pill">Hard</span>}
          {canNext && !(done && settled) && (
            <button className="btn small" type="button" onClick={nextWord}>
              {nextLabel}
            </button>
          )}
        </div>

        <div className="boards-wrap" ref={fitRef}>
          <Board guesses={game.guesses} draft={done ? '' : draft} instant={rev.instant} shake={fx.shake} bounce={fx.bounce} />
        </div>

        <div className="kb-area">
          {done && settled ? (
            <div className="result-card">
              <strong>{won ? `${PRAISE[game.guesses.length - 1]}! Solved in ${game.guesses.length}/6` : `The word was ${game.answer.toUpperCase()}`}</strong>
              <div className="btn-row">
                <button className="btn primary" type="button" onClick={() => setShowResult(true)}>
                  Results &amp; share
                </button>
                {game.kind !== 'daily' && (
                  <button className="btn" type="button" onClick={nextWord}>
                    {nextLabel}
                  </button>
                )}
              </div>
              {game.kind === 'daily' && <Countdown />}
            </div>
          ) : (
            <Keyboard states={letterStates(game.guesses.slice(0, rev.settled))} onKey={onKey} />
          )}
        </div>
      </div>

      {showResult && (
        <Modal title={won ? `${PRAISE[game.guesses.length - 1]}!` : 'Next time!'} onClose={() => setShowResult(false)}>
          <div className="result">
            <p className="result-big">{won ? `Solved in ${game.guesses.length}/6` : 'The word was'}</p>
            {!won && (
              <div className="answer-tiles">
                {[...game.answer].map((c, i) => (
                  <span key={i} className="tile" data-state="correct">
                    {c}
                  </span>
                ))}
              </div>
            )}
            {game.kind === 'challenge' && <p className="muted center">Word picked by {game.from}</p>}
            <StatsPanel highlight={won ? game.guesses.length : 0} />
            <div className="btn-row">
              <button className="btn primary" type="button" onClick={share}>
                Share result
              </button>
              {game.kind !== 'daily' && (
                <button className="btn" type="button" onClick={nextWord}>
                  {nextLabel}
                </button>
              )}
            </div>
            {game.kind === 'daily' && <Countdown />}
          </div>
        </Modal>
      )}
    </section>
  );
}
