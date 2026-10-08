import { useEffect, useState } from 'react';
import { LEN } from '../lib/wordle.js';

export const REVEAL_MS = (LEN - 1) * 250 + 500 + 60;

/**
 * Tracks the flip animation of a board's rows.
 *   instant – rows below this index appear without animating (they were already there when
 *             the board appeared, or arrived in a batch after a reconnect)
 *   settled – rows below this index have finished flipping (safe to colour the keyboard)
 * `key` identifies the round; a new key starts over.
 */
export function useReveal(count, key) {
  const [s, setS] = useState({ key, count, instant: count, settled: count });
  let cur = s;
  if (s.key !== key || count < s.count || count - s.count > 1) cur = { key, count, instant: count, settled: count };
  else if (count > s.count) cur = { ...s, count };
  if (cur !== s) setS(cur);

  useEffect(() => {
    if (cur.settled >= cur.count) return;
    const t = setTimeout(() => {
      setS((p) => (p.key === key && p.count === cur.count ? { ...p, settled: p.count } : p));
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [key, cur.count, cur.settled]);

  return cur;
}
