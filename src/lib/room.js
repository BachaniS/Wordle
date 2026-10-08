// Shared game state for two-player rooms. The host's browser runs `reduce` for both
// players and broadcasts the resulting state; secret words never leave the host until
// a round is over.
import { checkGuess, isWord, randomAnswer, score, ROWS } from './wordle.js';

export const MODES = {
  coop: { name: 'Co-op', icon: '🤝', blurb: 'One board, one word. Solve it together.' },
  race: { name: 'Race', icon: '🏁', blurb: 'Same word, separate boards. First to solve it wins.' },
  duel: { name: 'Word Duel', icon: '🎯', blurb: 'Pick a secret word for each other. Fewest guesses wins.' },
};

export const other = (p) => (p === 'A' ? 'B' : 'A');

const letters = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
export const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20);
const emptyBoard = () => ({ guesses: [], won: false, done: false });

export function newRoom(hostName) {
  return {
    state: {
      players: { A: { name: cleanName(hostName) || 'Host', online: true }, B: { name: '', online: false } },
      scores: { A: 0, B: 0, draws: 0 },
      team: { played: 0, won: 0 },
      opts: { hard: false, turns: true },
      round: 0,
      game: null,
    },
    secret: {},
  };
}

/** The board a player is currently guessing on. */
export const boardOf = (game, p) => (game.mode === 'coop' ? game.board : game.boards[p]);

function play(board, word, answer, by) {
  board.guesses.push(by ? { word, result: score(word, answer), by } : { word, result: score(word, answer) });
  if (word === answer) board.won = board.done = true;
  else if (board.guesses.length >= ROWS) board.done = true;
}

function duelWinner({ A, B }) {
  if (A.won !== B.won) return A.won ? 'A' : 'B';
  if (!A.won || A.guesses.length === B.guesses.length) return 'draw';
  return A.guesses.length < B.guesses.length ? 'A' : 'B';
}

/**
 * Apply player `p`'s action to the room. Mutates `room` in place.
 * Returns { error } for rejected actions, otherwise { events } — short lines for the chat log.
 */
export function reduce(room, action, p) {
  const s = room.state;
  const g = s.game;
  const name = (q) => s.players[q].name || (q === 'A' ? 'Host' : 'Guest');
  const events = [];
  const fail = (error) => ({ error, events });

  const finish = (winner) => {
    g.phase = 'over';
    if (g.mode === 'duel') g.answers = { ...room.secret.words };
    else g.answer = room.secret.word;
    if (g.mode === 'coop') {
      s.team.played++;
      if (g.board.won) s.team.won++;
      events.push(g.board.won ? `Solved together in ${g.board.guesses.length}/6 🎉` : `Out of guesses — it was ${g.answer.toUpperCase()}`);
      return;
    }
    g.winner = winner;
    if (winner === 'draw') s.scores.draws++;
    else s.scores[winner]++;
    if (g.mode === 'race') {
      events.push(winner === 'draw'
        ? `Nobody got it — the word was ${g.answer.toUpperCase()}`
        : `${name(winner)} wins the race in ${g.boards[winner].guesses.length}! The word was ${g.answer.toUpperCase()}`);
    } else {
      events.push(winner === 'draw' ? 'Word Duel ends in a draw' : `${name(winner)} wins the Word Duel 🏆`);
    }
  };

  switch (action.type) {
    case 'hello': {
      const known = !!s.players[p].name;
      s.players[p] = { name: cleanName(action.name) || (p === 'A' ? 'Host' : 'Guest'), online: true };
      events.push(known ? `${name(p)} is back` : `${name(p)} joined the room`);
      break;
    }

    case 'presence':
      if (s.players[p].online && !action.online) events.push(`${name(p)} ${action.left ? 'left the room' : 'disconnected'}`);
      s.players[p].online = !!action.online;
      break;

    case 'opts':
      if (g && g.phase !== 'over') return fail('Finish this round first');
      s.opts = { hard: !!action.opts?.hard, turns: !!action.opts?.turns };
      break;

    case 'start': {
      if (!Object.hasOwn(MODES, action.mode)) return fail('Unknown game mode');
      if (!s.players.B.online) return fail('Wait for your partner to join first');
      s.round++;
      const base = { id: s.round, mode: action.mode, hard: s.opts.hard, drafts: { A: '', B: '' } };
      if (action.mode === 'coop') {
        room.secret = { word: randomAnswer() };
        s.game = { ...base, phase: 'play', turns: s.opts.turns, turn: p, board: emptyBoard() };
      } else if (action.mode === 'race') {
        room.secret = { word: randomAnswer() };
        s.game = { ...base, phase: 'play', boards: { A: emptyBoard(), B: emptyBoard() } };
      } else {
        room.secret = { words: {} };
        s.game = { ...base, phase: 'pick', picked: { A: false, B: false }, boards: { A: emptyBoard(), B: emptyBoard() } };
      }
      events.push(`${name(p)} started ${MODES[action.mode].name}${s.opts.hard ? ' (hard mode)' : ''}`);
      break;
    }

    case 'lobby':
      if (g && g.phase !== 'over') events.push(`${name(p)} ended the round`);
      s.game = null;
      room.secret = {};
      break;

    case 'draft':
      if (g && g.phase === 'play') g.drafts[p] = letters(action.word);
      break;

    case 'pick': {
      if (!g || g.mode !== 'duel' || g.phase !== 'pick') return fail('Not picking words right now');
      const w = letters(action.word);
      if (w.length < 5) return fail('Not enough letters');
      if (!isWord(w)) return fail('Not in word list');
      room.secret.words[other(p)] = w;
      g.picked[p] = true;
      if (g.picked.A && g.picked.B) {
        g.phase = 'play';
        events.push('Both words are locked in — go!');
      }
      break;
    }

    case 'guess': {
      if (!g || g.phase !== 'play') return fail('No round in progress');
      const w = letters(action.word);
      const board = boardOf(g, p);
      if (board.done) return fail('Your board is finished — hang tight');
      if (g.mode === 'coop' && g.turns && g.turn !== p) return fail(`It's ${name(g.turn)}'s turn`);
      const err = checkGuess(w, board.guesses, g.hard);
      if (err) return fail(err);

      if (g.mode === 'coop') {
        play(board, w, room.secret.word, p);
        g.drafts[p] = '';
        if (board.done) finish();
        else g.turn = other(p);
      } else {
        play(board, w, g.mode === 'race' ? room.secret.word : room.secret.words[p]);
        g.drafts[p] = '';
        const both = g.boards.A.done && g.boards.B.done;
        if (g.mode === 'race' && board.won) finish(p);
        else if (both) finish(g.mode === 'race' ? 'draw' : duelWinner(g.boards));
      }
      break;
    }

    default:
      return fail('Unknown action');
  }
  return { events };
}
