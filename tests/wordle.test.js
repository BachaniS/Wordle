import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS } from '../src/lib/words.js';
import {
  score, hardModeError, checkGuess, letterStates, dailyAnswer, dayNumber, encodeChallenge, decodeChallenge, emojiGrid,
} from '../src/lib/wordle.js';

const C = 'correct', P = 'present', A = 'absent';

test('scores exact and partial matches', () => {
  assert.deepEqual(score('crane', 'crane'), [C, C, C, C, C]);
  assert.deepEqual(score('pilot', 'crane'), [A, A, A, A, A]);
  assert.deepEqual(score('nacre', 'crane'), [P, P, P, P, C]);
});

test('repeated letters are only marked as often as they appear in the answer', () => {
  assert.deepEqual(score('speed', 'abide'), [A, A, P, A, P]);
  assert.deepEqual(score('eerie', 'there'), [P, A, P, A, C]);
  assert.deepEqual(score('lolly', 'level'), [C, A, P, A, A]);
});

test('hard mode requires greens in place and known letters present', () => {
  const rows = [{ word: 'crane', result: score('crane', 'cloud') }];
  assert.equal(hardModeError('pious', rows), '1st letter must be C');
  assert.equal(hardModeError('could', rows), null);
  const rows2 = [{ word: 'speed', result: score('speed', 'abide') }];
  assert.equal(hardModeError('crane', rows2), 'Guess must contain D');
  assert.equal(hardModeError('dread', rows2), null);
});

test('checkGuess validates length and dictionary', () => {
  assert.equal(checkGuess('cran', [], false), 'Not enough letters');
  assert.equal(checkGuess('zzzzz', [], false), 'Not in word list');
  assert.equal(checkGuess('crane', [], false), null);
});

test('keyboard keeps the best state for each letter', () => {
  const rows = [
    { word: 'crane', result: [P, A, A, A, A] },
    { word: 'cloud', result: [C, A, A, A, A] },
  ];
  assert.equal(letterStates(rows).c, C);
  assert.equal(letterStates(rows).r, A);
});

test('daily word is stable and always a valid answer', () => {
  const day = dayNumber(new Date(2026, 9, 7));
  assert.equal(dailyAnswer(day), dailyAnswer(day));
  assert.notEqual(dailyAnswer(day), dailyAnswer(day + 1));
  for (let d = -5; d < 3000; d += 97) assert.ok(ANSWERS.includes(dailyAnswer(d)));
  assert.equal(dayNumber(new Date(2026, 0, 1)), 1);
});

test('challenge links round-trip and hide the word', () => {
  const code = encodeChallenge('crane', 'Zoë 🌟');
  assert.ok(!code.includes('crane'));
  assert.deepEqual(decodeChallenge(code), { word: 'crane', from: 'Zoë 🌟' });
  assert.equal(decodeChallenge('garbage!!'), null);
});

test('emoji grid', () => {
  assert.equal(emojiGrid([{ word: 'crane', result: [C, P, A, A, C] }]), '🟩🟨⬛⬛🟩');
});
