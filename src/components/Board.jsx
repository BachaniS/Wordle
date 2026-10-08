import { useEffect, useRef } from 'react';
import { LEN, ROWS } from '../lib/wordle.js';

const SHAKE = [0, -6, 6, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` }));
const BOUNCE = [
  { transform: 'translateY(0)' },
  { transform: 'translateY(-30%)', offset: 0.4 },
  { transform: 'translateY(5%)', offset: 0.5 },
  { transform: 'translateY(-15%)', offset: 0.6 },
  { transform: 'translateY(2%)', offset: 0.8 },
  { transform: 'translateY(0)' },
];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A Wordle grid.
 *   guesses  [{ word, result, by? }] — scored rows
 *   draft    letters being typed on the next row (`ghost` styles them as someone else's)
 *   instant  rows below this index skip the flip animation
 *   badge    (by) => label shown beside rows in co-op
 *   shake / bounce  { row, id } — plays once for every new object
 */
export function Board({ guesses, draft = '', rows = ROWS, instant = Infinity, ghost = false, badge, shake, bounce, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (shake && !reducedMotion()) ref.current?.children[shake.row]?.animate(SHAKE, { duration: 450 });
  }, [shake]);

  useEffect(() => {
    if (!bounce || reducedMotion()) return;
    ref.current?.children[bounce.row]?.querySelectorAll('.tile').forEach((tile, i) => {
      tile.animate(BOUNCE, { duration: 600, delay: i * 90, easing: 'ease' });
    });
  }, [bounce]);

  return (
    <div className={`board ${className}`} ref={ref}>
      {Array.from({ length: rows }, (_, r) => {
        const g = guesses[r];
        const text = g ? g.word : r === guesses.length ? draft : '';
        return (
          <div key={r} className={!g && ghost && text ? 'row ghost' : 'row'}>
            {g?.by && badge && (
              <span className="by" data-p={g.by} aria-hidden="true">
                {badge(g.by)}
              </span>
            )}
            {Array.from({ length: LEN }, (_, i) => {
              const ch = text[i] || '';
              const state = g?.result[i];
              const animate = state && r >= instant;
              return (
                <div
                  key={i}
                  className={`tile${ch ? ' filled' : ''}${animate ? ' reveal' : ''}`}
                  data-state={state}
                  style={animate ? { '--i': i } : undefined}
                  aria-label={state ? `${ch} ${state}` : undefined}
                >
                  {ch}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
