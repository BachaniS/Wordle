import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimSeat, newRoom, reduce, MAX_PLAYERS } from '../src/lib/room.js';

const GUESTS = ['Ben', 'Cat', 'Dan'];

/** A room with the host (Ann) plus `guests` more players, all online. */
function makeRoom(guests = 1) {
  const room = newRoom('Ann');
  for (let i = 0; i < guests; i++) {
    const seat = claimSeat(room, `client-${i}`);
    reduce(room, { type: 'hello', name: GUESTS[i] }, seat);
  }
  return room;
}

function setup(mode, opts = {}, guests = 1) {
  const room = makeRoom(guests);
  if (Object.keys(opts).length) reduce(room, { type: 'opts', opts: { ...room.state.opts, ...opts } }, 'A');
  assert.equal(reduce(room, { type: 'start', mode }, 'A').error, undefined);
  return room;
}
const wrongWord = (answer) => (answer === 'pilot' ? 'crane' : 'pilot');

test('games cannot start until someone else has joined', () => {
  const room = newRoom('Ann');
  assert.match(reduce(room, { type: 'start', mode: 'coop' }, 'A').error, /join/);
  assert.ok(reduce(room, { type: 'start', mode: '__proto__' }, 'A').error);
});

test('seats: guests fill B–D, keep their seat on reconnect, and the fifth is turned away', () => {
  const room = newRoom('Ann');
  assert.equal(claimSeat(room, 'ben'), 'B');
  assert.equal(claimSeat(room, 'cat'), 'C');
  assert.equal(claimSeat(room, 'ben'), 'B');
  assert.equal(claimSeat(room, 'dan'), 'D');
  assert.equal(claimSeat(room, 'eve'), null);
  assert.equal(claimSeat(room, ''), null);
  assert.equal(MAX_PLAYERS, 4);
  assert.ok(!JSON.stringify(room.state).includes('ben'), 'client ids stay on the host');
});

test('leaving frees the seat for someone new, with a fresh score', () => {
  const room = makeRoom(3);
  room.state.scores.C = 5;
  assert.deepEqual(reduce(room, { type: 'leave' }, 'C').events, ['Cat left the room']);
  assert.equal(room.state.players.C, undefined);
  assert.equal(claimSeat(room, 'eve'), 'C');
  assert.equal(room.state.scores.C, 0);
  assert.equal(claimSeat(room, 'client-1'), null, "Cat's old id no longer holds a seat");
});

test('only the host can remove players, and only when they are offline', () => {
  const room = makeRoom(2);
  assert.match(reduce(room, { type: 'kick', seat: 'C' }, 'B').error, /host/);
  assert.match(reduce(room, { type: 'kick', seat: 'C' }, 'A').error, /still connected/);
  assert.ok(reduce(room, { type: 'kick', seat: 'A' }, 'A').error);
  reduce(room, { type: 'presence', online: false }, 'C');
  assert.equal(reduce(room, { type: 'kick', seat: 'C' }, 'A').error, undefined);
  assert.equal(room.state.players.C, undefined);
});

test('a round includes only the players online when it starts', () => {
  const room = makeRoom(3);
  reduce(room, { type: 'presence', online: false }, 'D');
  reduce(room, { type: 'start', mode: 'race' }, 'B');
  assert.deepEqual(room.state.game.players, ['A', 'B', 'C']);
  reduce(room, { type: 'hello', name: 'Dan' }, 'D');
  assert.match(reduce(room, { type: 'guess', word: 'crane' }, 'D').error, /watching/);
});

test('co-op: players take turns and the answer stays secret until the end', () => {
  const room = setup('coop');
  const answer = room.secret.word;
  assert.ok(!JSON.stringify(room.state).includes(`"${answer}"`));
  assert.match(reduce(room, { type: 'guess', word: 'crane' }, 'B').error, /Ann's turn/);
  reduce(room, { type: 'guess', word: wrongWord(answer) }, 'A');
  assert.equal(room.state.game.turn, 'B');
  assert.equal(room.state.game.board.guesses[0].by, 'A');
  reduce(room, { type: 'guess', word: answer }, 'B');
  assert.equal(room.state.game.phase, 'over');
  assert.equal(room.state.game.answer, answer);
  assert.deepEqual(room.state.team, { played: 1, won: 1 });
});

test('co-op with four: turns go round the table and skip whoever is offline', () => {
  const room = setup('coop', {}, 3);
  const w = wrongWord(room.secret.word);
  const turns = [];
  for (let i = 0; i < 4; i++) {
    const g = room.state.game;
    turns.push(g.turn);
    reduce(room, { type: 'guess', word: w }, g.turn);
  }
  assert.deepEqual(turns, ['A', 'B', 'C', 'D']);
  assert.equal(room.state.game.turn, 'A');

  reduce(room, { type: 'presence', online: false }, 'B');
  reduce(room, { type: 'guess', word: w }, 'A');
  assert.equal(room.state.game.turn, 'C', 'B is skipped while offline');
  reduce(room, { type: 'presence', online: false }, 'C');
  assert.equal(room.state.game.turn, 'D', 'the turn moves on if its owner drops');
});

test('co-op: someone joining mid-round gets a place in the rotation', () => {
  const room = setup('coop');
  const seat = claimSeat(room, 'late');
  reduce(room, { type: 'hello', name: 'Cat' }, seat);
  assert.deepEqual(room.state.game.players, ['A', 'B', 'C']);
  const w = wrongWord(room.secret.word);
  reduce(room, { type: 'guess', word: w }, 'A');
  reduce(room, { type: 'guess', word: w }, 'B');
  assert.equal(room.state.game.turn, 'C');
});

test('co-op without turns lets anyone guess', () => {
  const room = setup('coop', { turns: false });
  const w = wrongWord(room.secret.word);
  assert.equal(reduce(room, { type: 'guess', word: w }, 'B').error, undefined);
  assert.equal(reduce(room, { type: 'guess', word: w }, 'B').error, undefined);
});

test('race: first to solve wins', () => {
  const room = setup('race', {}, 3);
  const answer = room.secret.word;
  reduce(room, { type: 'guess', word: wrongWord(answer) }, 'A');
  reduce(room, { type: 'guess', word: wrongWord(answer) }, 'D');
  reduce(room, { type: 'guess', word: answer }, 'C');
  assert.deepEqual(room.state.game.winners, ['C']);
  assert.equal(room.state.scores.C, 1);
  assert.ok(reduce(room, { type: 'guess', word: answer }, 'A').error);
});

test('race: a draw when nobody solves it', () => {
  const room = setup('race');
  const w = wrongWord(room.secret.word);
  for (let i = 0; i < 6; i++) {
    reduce(room, { type: 'guess', word: w }, 'A');
    reduce(room, { type: 'guess', word: w }, 'B');
  }
  assert.deepEqual(room.state.game.winners, []);
  assert.equal(room.state.scores.draws, 1);
});

test('race: if a player leaves, the round can still finish without them', () => {
  const room = setup('race', {}, 2);
  const w = wrongWord(room.secret.word);
  for (let i = 0; i < 6; i++) {
    reduce(room, { type: 'guess', word: w }, 'A');
    reduce(room, { type: 'guess', word: w }, 'B');
  }
  assert.equal(room.state.game.phase, 'play', 'still waiting on Cat');
  reduce(room, { type: 'leave' }, 'C');
  assert.equal(room.state.game.phase, 'over');
  assert.deepEqual(room.state.game.players, ['A', 'B']);
});

test('word duel: each guesses the word the other picked; fewest guesses wins', () => {
  const room = setup('duel');
  assert.ok(reduce(room, { type: 'guess', word: 'crane' }, 'A').error);
  assert.ok(reduce(room, { type: 'pick', word: 'zzzzz' }, 'A').error);
  reduce(room, { type: 'pick', word: 'crane' }, 'A'); // Ben has to find CRANE
  assert.equal(room.state.game.phase, 'pick');
  reduce(room, { type: 'pick', word: 'pilot' }, 'B'); // Ann has to find PILOT
  assert.equal(room.state.game.phase, 'play');
  assert.ok(!JSON.stringify(room.state).includes('"pilot"'));

  reduce(room, { type: 'guess', word: 'slate' }, 'A');
  reduce(room, { type: 'guess', word: 'pilot' }, 'A');
  assert.equal(room.state.game.phase, 'play');
  reduce(room, { type: 'guess', word: 'crane' }, 'B');
  assert.equal(room.state.game.phase, 'over');
  assert.deepEqual(room.state.game.winners, ['B']);
  assert.deepEqual(room.state.game.answers, { A: 'pilot', B: 'crane' });
});

test('word duel with four: words go round the circle and ties share the win', () => {
  const room = setup('duel', {}, 3);
  assert.deepEqual(room.state.game.target, { A: 'B', B: 'C', C: 'D', D: 'A' });
  const picks = { A: 'crane', B: 'pilot', C: 'mount', D: 'shard' };
  for (const [q, w] of Object.entries(picks)) reduce(room, { type: 'pick', word: w }, q);
  assert.equal(room.state.game.phase, 'play');

  reduce(room, { type: 'guess', word: 'shard' }, 'A'); // D picked for A
  reduce(room, { type: 'guess', word: 'crane' }, 'B'); // A picked for B
  reduce(room, { type: 'guess', word: 'slate' }, 'C');
  reduce(room, { type: 'guess', word: 'pilot' }, 'C');
  assert.equal(room.state.game.phase, 'play');
  reduce(room, { type: 'guess', word: 'mount' }, 'D');
  assert.equal(room.state.game.phase, 'over');
  assert.deepEqual(room.state.game.winners, ['A', 'B', 'D']);
  assert.deepEqual([room.state.scores.A, room.state.scores.B, room.state.scores.C], [1, 1, 0]);
});

test('word duel: if someone leaves while picking, the circle closes up', () => {
  const room = setup('duel', {}, 2); // A→B→C→A
  reduce(room, { type: 'pick', word: 'crane' }, 'A'); // for Ben
  reduce(room, { type: 'pick', word: 'pilot' }, 'C'); // for Ann
  const { events } = reduce(room, { type: 'leave' }, 'B');
  const g = room.state.game;
  assert.deepEqual(g.target, { A: 'C', C: 'A' });
  assert.equal(g.picked.A, false, 'Ann has to pick again, this time for Cat');
  assert.match(events.join(' '), /Ann, pick a new word for Cat/);
  reduce(room, { type: 'pick', word: 'mount' }, 'A');
  assert.equal(g.phase, 'play');
  reduce(room, { type: 'guess', word: 'mount' }, 'C');
  reduce(room, { type: 'guess', word: 'pilot' }, 'A');
  assert.deepEqual(g.winners, ['A', 'C']);
});

test('word duel: back to the lobby if only one player is left to pick', () => {
  const room = setup('duel');
  reduce(room, { type: 'presence', online: false }, 'B');
  reduce(room, { type: 'kick', seat: 'B' }, 'A');
  assert.equal(room.state.game, null);
});

test('hard mode is enforced on the server side too', () => {
  const room = setup('race', { hard: true });
  room.secret.word = 'cloud';
  reduce(room, { type: 'guess', word: 'crane' }, 'A');
  assert.equal(reduce(room, { type: 'guess', word: 'pious' }, 'A').error, '1st letter must be C');
});

test('drafts are cleaned and presence events are not repeated', () => {
  const room = setup('coop');
  reduce(room, { type: 'draft', word: 'AB<c>d1ef' }, 'B');
  assert.equal(room.state.game.drafts.B, 'abcde');
  assert.deepEqual(reduce(room, { type: 'presence', online: false }, 'B').events, ['Ben disconnected']);
  assert.equal(room.state.game.drafts.B, '', 'a half-typed word goes when its typist does');
  assert.deepEqual(reduce(room, { type: 'presence', online: false }, 'B').events, []);
});
