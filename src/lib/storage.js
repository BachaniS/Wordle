// JSON helpers around localStorage / sessionStorage that never throw
// (private browsing and blocked storage just fall back to defaults).

const makeStore = (getArea) => ({
  get(key, fallback) {
    try {
      const v = getArea().getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      getArea().setItem(key, JSON.stringify(value));
    } catch {}
  },
  del(key) {
    try {
      getArea().removeItem(key);
    } catch {}
  },
});

export const local = makeStore(() => localStorage);
export const session = makeStore(() => sessionStorage);

// ---- solo statistics ----

const blankStats = () => ({ played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] });

export const loadStats = () => ({ ...blankStats(), ...local.get('wt-stats', {}) });

export function recordResult(won, guessCount) {
  const s = loadStats();
  s.played++;
  if (won) {
    s.wins++;
    s.streak++;
    s.best = Math.max(s.best, s.streak);
    s.dist[guessCount - 1]++;
  } else {
    s.streak = 0;
  }
  local.set('wt-stats', s);
  return s;
}
