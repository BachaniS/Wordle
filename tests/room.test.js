import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, reduce } from '../src/lib/room.js';

function setup(mode, opts = {}) {
  const room = newRoom('Ann');
  reduce(room, { type: 'hello', name: 'Ben' }, 'B');
  if (Object.keys(opts).length) reduce(room, { type: 'opts', opts: { ...room.state.opts, ...opts } }, 'A');
  assert.equal(reduce(room, { type: 'start', mode }, 'A').error, undefined);
  return room;
}
const wrongWord = (answer) => (answer === 'pilot' ? 'crane' : 'pilot');

test('games cannot start until the partner has joined', () => {
  const room = newRoom('Ann');
  assert.match(reduce(room, { type: 'start', mode: 'coop' }, 'A').error, /partner/);
  assert.ok(reduce(room, { type: 'start', mode: '__proto__' }, 'A').error);
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

test('co-op without turns lets anyone guess', () => {
  const room = setup('coop', { turns: false });
  const w = wrongWord(room.secret.word);
  assert.equal(reduce(room, { type: 'guess', word: w }, 'B').error, undefined);
  assert.equal(reduce(room, { type: 'guess', word: w }, 'B').error, undefined);
});

test('race: first to solve wins', () => {
  const room = setup('race');
  const answer = room.secret.word;
  reduce(room, { type: 'guess', word: wrongWord(answer) }, 'A');
  reduce(room, { type: 'guess', word: answer }, 'B');
  assert.equal(room.state.game.winner, 'B');
  assert.equal(room.state.scores.B, 1);
  assert.ok(reduce(room, { type: 'guess', word: answer }, 'A').error);
});

test('race: a draw when nobody solves it', () => {
  const room = setup('race');
  const w = wrongWord(room.secret.word);
  for (let i = 0; i < 6; i++) {
    reduce(room, { type: 'guess', word: w }, 'A');
    reduce(room, { type: 'guess', word: w }, 'B');
  }
  assert.equal(room.state.game.winner, 'draw');
  assert.equal(room.state.scores.draws, 1);
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
  assert.equal(room.state.game.winner, 'B');
  assert.deepEqual(room.state.game.answers, { A: 'pilot', B: 'crane' });
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
  assert.deepEqual(reduce(room, { type: 'presence', online: false }, 'B').events, []);
});
