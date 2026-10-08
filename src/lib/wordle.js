// Core Wordle rules — pure functions shared by solo and multiplayer modes.
import { ANSWERS, VALID } from './words.js';

export const LEN = 5;
export const ROWS = 6;
export const PRAISE = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];

export const isWord = (w) => VALID.has(w);
export const randomAnswer = () => ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

/** Colour each letter of a guess. Repeated letters are handled like the original game. */
export function score(guess, answer) {
  const result = Array(LEN).fill('absent');
  const unmatched = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct';
    else unmatched[answer[i]] = (unmatched[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (result[i] !== 'correct' && unmatched[guess[i]] > 0) {
      result[i] = 'present';
      unmatched[guess[i]]--;
    }
  }
  return result;
}

const ordinal = (n) => ['1st', '2nd', '3rd', '4th', '5th'][n];

/** Hard mode: every revealed hint must be used in later guesses. */
export function hardModeError(guess, rows) {
  for (const { word, result } of rows) {
    for (let i = 0; i < LEN; i++) {
      if (result[i] === 'correct' && guess[i] !== word[i]) {
        return `${ordinal(i)} letter must be ${word[i].toUpperCase()}`;
      }
    }
    const needed = {};
    for (let i = 0; i < LEN; i++) {
      if (result[i] !== 'absent') needed[word[i]] = (needed[word[i]] || 0) + 1;
    }
    for (const [ch, n] of Object.entries(needed)) {
      if (guess.split(ch).length - 1 < n) return `Guess must contain ${ch.toUpperCase()}`;
    }
  }
  return null;
}

/** Returns an error message, or null if the guess may be played. */
export function checkGuess(word, rows, hard) {
  if (word.length < LEN) return 'Not enough letters';
  if (!isWord(word)) return 'Not in word list';
  return hard ? hardModeError(word, rows) : null;
}

const RANK = { absent: 1, present: 2, correct: 3 };

/** Best known state of each letter, for colouring the on-screen keyboard. */
export function letterStates(rows) {
  const states = {};
  for (const { word, result } of rows) {
    for (let i = 0; i < LEN; i++) {
      const ch = word[i];
      if (!states[ch] || RANK[result[i]] > RANK[states[ch]]) states[ch] = result[i];
    }
  }
  return states;
}

// ---- Daily word: same for everyone on the same calendar day ----

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let dailyOrder = null;
export function dailyAnswer(day) {
  if (!dailyOrder) {
    const rand = mulberry32(20260101);
    dailyOrder = [...ANSWERS];
    for (let i = dailyOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [dailyOrder[i], dailyOrder[j]] = [dailyOrder[j], dailyOrder[i]];
    }
  }
  const n = dailyOrder.length;
  return dailyOrder[((day % n) + n) % n];
}

const EPOCH = Date.UTC(2026, 0, 1);
export function dayNumber(d = new Date()) {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 864e5) + 1;
}

export function msUntilTomorrow(d = new Date()) {
  const next = new Date(d);
  next.setHours(24, 0, 0, 0);
  return next - d;
}

// ---- Challenge links: the word is lightly scrambled so it isn't readable in the URL ----

const KEY = [7, 19, 3, 11, 23];
const shift = (w, dir) =>
  [...w].map((c, i) => String.fromCharCode(97 + ((c.charCodeAt(0) - 97 + dir * KEY[i] + 26) % 26))).join('');

export function encodeChallenge(word, from) {
  const bytes = new TextEncoder().encode(JSON.stringify({ w: shift(word, 1), f: from }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeChallenge(code) {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const { w, f } = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const word = shift(String(w), -1);
    return /^[a-z]{5}$/.test(word) && isWord(word) ? { word, from: String(f || 'A friend').slice(0, 24) } : null;
  } catch {
    return null;
  }
}

// ---- Sharing ----

const EMOJI = { correct: '🟩', present: '🟨', absent: '⬛' };
const EMOJI_CONTRAST = { correct: '🟧', present: '🟦', absent: '⬛' };

export function emojiGrid(rows, highContrast = false) {
  const map = highContrast ? EMOJI_CONTRAST : EMOJI;
  return rows.map((r) => r.result.map((s) => map[s]).join('')).join('\n');
}
