// Shared game state for rooms of 2–4 players. The host's browser runs `reduce` for
// everyone and broadcasts the resulting state; secret words never leave the host until
// a round is over.
//
// Players sit in seats A–D. The host is always A; guests get the first free seat.
import { checkGuess, isWord, randomAnswer, score, ROWS } from './wordle.js';

export const MODES = {
  coop: { name: 'Co-op', icon: '🤝', blurb: 'One board, one word. Solve it together.' },
  race: { name: 'Race', icon: '🏁', blurb: 'Same word, separate boards. First to solve it wins.' },
  duel: { name: 'Word Duel', icon: '🎯', blurb: 'Pick secret words for each other. Fewest guesses wins.' },
};

export const SEATS = ['A', 'B', 'C', 'D'];
export const MAX_PLAYERS = SEATS.length;

const letters = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
export const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20);
const emptyBoard = () => ({ guesses: [], won: false, done: false });

export const defaultName = (q) => (q === 'A' ? 'Host' : `Player ${SEATS.indexOf(q) + 1}`);
export const playerName = (s, q) => s?.players[q]?.name || defaultName(q);

/** Seats that have someone in them, in seat order. */
export const seated = (s) => SEATS.filter((q) => s.players[q]);
const onlineSeats = (s) => seated(s).filter((q) => s.players[q].online);

export function newRoom(hostName) {
  return {
    state: {
      players: { A: { name: cleanName(hostName) || 'Host', online: true } },
      scores: { A: 0, draws: 0 },
      team: { played: 0, won: 0 },
      opts: { hard: false, turns: true },
      round: 0,
      game: null,
    },
    secret: {},
    seats: {}, // guest client id -> seat. Host-only: never broadcast.
  };
}

/**
 * Host: find the seat for a guest's client id: the one they had before, else the first
 * free one. Returns null when the room is full.
 */
export function claimSeat(room, clientId) {
  const id = String(clientId || '').slice(0, 64);
  if (!id) return null;
  const s = room.state;
  const known = room.seats[id];
  if (known && s.players[known]) return known;
  const free = SEATS.find((q) => !s.players[q]);
  if (!free) return null;
  room.seats[id] = free;
  s.players[free] = { name: '', online: false };
  s.scores[free] = 0;
  return free;
}

/** The board a player is currently guessing on. */
export const boardOf = (game, p) => (game.mode === 'coop' ? game.board : game.boards[p]);

/** Word Duel: the player who picks the word that `q` has to guess. */
export const pickerFor = (game, q) => Object.keys(game.target || {}).find((x) => game.target[x] === q);

/** Word Duel: everyone picks a word for the next player round the circle. */
const circle = (players) => Object.fromEntries(players.map((q, i) => [q, players[(i + 1) % players.length]]));

/** Co-op: whose turn comes after `from`. Skips players who are offline. */
function nextTurn(s, g, from) {
  const start = SEATS.indexOf(from);
  for (let i = 1; i <= SEATS.length; i++) {
    const q = SEATS[(start + i) % SEATS.length];
    if (g.players.includes(q) && s.players[q]?.online) return q;
  }
  return g.players.includes(from) ? from : g.players[0];
}

function play(board, word, answer, by) {
  board.guesses.push(by ? { word, result: score(word, answer), by } : { word, result: score(word, answer) });
  if (word === answer) board.won = board.done = true;
  else if (board.guesses.length >= ROWS) board.done = true;
}

/** Word Duel: whoever solved their word in the fewest guesses (ties share the win). */
function duelWinners(g) {
  const solved = g.players.filter((q) => g.boards[q].won);
  if (!solved.length) return [];
  const best = Math.min(...solved.map((q) => g.boards[q].guesses.length));
  return solved.filter((q) => g.boards[q].guesses.length === best);
}

/** "Ann", "Ann and Ben", "Ann, Ben and Cat" */
export const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * Apply player `p`'s action to the room. Mutates `room` in place.
 * Returns { error } for rejected actions, otherwise { events } — short lines for the chat log.
 */
export function reduce(room, action, p) {
  const s = room.state;
  const g = s.game;
  const name = (q) => playerName(s, q);
  const events = [];
  const fail = (error) => ({ error, events });
  const allDone = () => g.players.every((q) => g.boards[q].done);

  const finish = (winners) => {
    g.phase = 'over';
    if (g.mode === 'duel') g.answers = { ...room.secret.words };
    else g.answer = room.secret.word;
    if (g.mode === 'coop') {
      s.team.played++;
      if (g.board.won) s.team.won++;
      events.push(g.board.won ? `Solved together in ${g.board.guesses.length}/6 🎉` : `Out of guesses — it was ${g.answer.toUpperCase()}`);
      return;
    }
    g.winners = winners;
    if (!winners.length) s.scores.draws++;
    for (const q of winners) if (q in s.scores) s.scores[q]++;
    const who = listNames(winners.map((q) => g.names[q] || name(q)));
    if (g.mode === 'race') {
      events.push(winners.length
        ? `${who} wins the race in ${g.boards[winners[0]].guesses.length}! The word was ${g.answer.toUpperCase()}`
        : `Nobody got it — the word was ${g.answer.toUpperCase()}`);
    } else {
      events.push(!winners.length
        ? 'Word Duel ends in a draw'
        : winners.length > 1 ? `${who} tie for the Word Duel 🏆` : `${who} wins the Word Duel 🏆`);
    }
  };

  /** Someone left (or was removed): free their seat and take them out of the current round. */
  const removePlayer = (q, verb) => {
    events.push(`${name(q)} ${verb}`);
    delete s.players[q];
    delete s.scores[q];
    for (const [id, seat] of Object.entries(room.seats)) if (seat === q) delete room.seats[id];
    if (!g?.players.includes(q)) return;

    g.players = g.players.filter((x) => x !== q);
    delete g.drafts[q];
    if (g.mode === 'coop') {
      if (g.turn === q) g.turn = nextTurn(s, g, q);
      return;
    }
    if (g.phase === 'pick') {
      if (g.players.length < 2) {
        s.game = null;
        room.secret = {};
        events.push('Not enough players left — back to the lobby');
        return;
      }
      // Whoever was picking a word for them now picks one for the next player instead.
      const prev = pickerFor(g, q);
      const next = g.target[q];
      g.target[prev] = next;
      delete g.target[q];
      delete g.picked[q];
      delete room.secret.words[q];
      if (g.picked[prev]) {
        g.picked[prev] = false;
        events.push(`${name(prev)}, pick a new word for ${name(next)}`);
      }
      return;
    }
    delete g.boards[q];
    if (g.phase === 'play' && allDone()) finish(g.mode === 'race' ? [] : duelWinners(g));
  };

  switch (action.type) {
    case 'hello': {
      if (!s.players[p]) return fail('No seat for you in this room');
      const known = !!s.players[p].name;
      s.players[p] = { name: cleanName(action.name) || defaultName(p), online: true };
      events.push(known ? `${name(p)} is back` : `${name(p)} joined the room`);
      if (g && g.phase !== 'over' && g.mode === 'coop') {
        // Anyone can hop onto a shared board mid-round.
        if (!g.players.includes(p)) {
          g.players = SEATS.filter((q) => q === p || g.players.includes(q));
          g.drafts[p] = '';
        }
        if (g.turns && !s.players[g.turn]?.online) g.turn = p;
      }
      if (g?.players.includes(p)) g.names[p] = s.players[p].name;
      break;
    }

    case 'presence':
      if (!s.players[p]) break;
      if (s.players[p].online && !action.online) events.push(`${name(p)} disconnected`);
      s.players[p].online = !!action.online;
      if (!action.online && g?.players.includes(p)) {
        g.drafts[p] = ''; // don't leave "… is typing" up for someone who's gone
        if (g.mode === 'coop' && g.turns && g.phase === 'play' && g.turn === p) g.turn = nextTurn(s, g, p);
      }
      break;

    case 'leave':
      if (p === 'A' || !s.players[p]) return fail('Unknown player');
      removePlayer(p, 'left the room');
      break;

    case 'kick': {
      const q = action.seat;
      if (p !== 'A') return fail('Only the host can remove players');
      if (q === 'A' || !SEATS.includes(q) || !s.players[q]) return fail('Unknown player');
      if (s.players[q].online) return fail(`${name(q)} is still connected`);
      removePlayer(q, 'was removed from the room');
      break;
    }

    case 'opts':
      if (g && g.phase !== 'over') return fail('Finish this round first');
      s.opts = { hard: !!action.opts?.hard, turns: !!action.opts?.turns };
      break;

    case 'start': {
      if (!Object.hasOwn(MODES, action.mode)) return fail('Unknown game mode');
      const players = onlineSeats(s);
      if (players.length < 2) return fail('Wait for someone to join first');
      s.round++;
      const base = {
        id: s.round,
        mode: action.mode,
        hard: s.opts.hard,
        players,
        names: Object.fromEntries(players.map((q) => [q, name(q)])),
        drafts: Object.fromEntries(players.map((q) => [q, ''])),
      };
      const boards = () => Object.fromEntries(players.map((q) => [q, emptyBoard()]));
      if (action.mode === 'coop') {
        room.secret = { word: randomAnswer() };
        s.game = { ...base, phase: 'play', turns: s.opts.turns, turn: p, board: emptyBoard() };
      } else if (action.mode === 'race') {
        room.secret = { word: randomAnswer() };
        s.game = { ...base, phase: 'play', boards: boards() };
      } else {
        room.secret = { words: {} };
        const picked = Object.fromEntries(players.map((q) => [q, false]));
        s.game = { ...base, phase: 'pick', target: circle(players), picked, boards: boards() };
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
      if (g && g.phase === 'play' && g.players.includes(p)) g.drafts[p] = letters(action.word);
      break;

    case 'pick': {
      if (!g || g.mode !== 'duel' || g.phase !== 'pick') return fail('Not picking words right now');
      if (!g.players.includes(p)) return fail("You're watching this round");
      const w = letters(action.word);
      if (w.length < 5) return fail('Not enough letters');
      if (!isWord(w)) return fail('Not in word list');
      room.secret.words[g.target[p]] = w;
      g.picked[p] = true;
      if (g.players.every((q) => g.picked[q])) {
        g.phase = 'play';
        events.push(g.players.length > 2 ? 'All words are locked in — go!' : 'Both words are locked in — go!');
      }
      break;
    }

    case 'guess': {
      if (!g || g.phase !== 'play') return fail('No round in progress');
      if (!g.players.includes(p)) return fail("You're watching this round — you'll be in the next one");
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
        else if (g.turns) g.turn = nextTurn(s, g, p);
      } else {
        play(board, w, g.mode === 'race' ? room.secret.word : room.secret.words[p]);
        g.drafts[p] = '';
        if (g.mode === 'race' && board.won) finish([p]);
        else if (allDone()) finish(g.mode === 'race' ? [] : duelWinners(g));
      }
      break;
    }

    default:
      return fail('Unknown action');
  }
  return { events };
}
