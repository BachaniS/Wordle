import { useCallback } from 'react';

const GAP = 5; // between tiles on your board
const MINI_GAP = 3; // between tiles on someone else's (mini) board
const RATIO = 0.42; // mini tiles relative to yours, at most
const LABEL = 26; // name line above a mini board
const NOTE = 20; // and the note under it, when there is one
const LABEL_SLACK = 20; // a name label can be a bit wider than its board
const GRID_GAP = 10; // between mini boards
const SIDE_GAP = 16; // between your board and the minis
const PAD = 12;
const MAX_TILE = 62;

/** Room per item when `n` items share `avail` px with gaps between them, minus each one's fixed part. */
const share = (avail, n, fixed) => (avail - (n - 1) * GRID_GAP) / n - fixed;

/** Your tile size, and the mini size, with the other boards in a grid of `cols` columns. */
function layout(w, h, opps, cols, mine, label) {
  const rows = Math.ceil(opps / cols);
  const miniByW = share(w, cols, 4 * MINI_GAP + LABEL_SLACK) / 5;
  const miniByH = share(h, rows, 5 * MINI_GAP + label) / 6;
  if (!mine) return { tile: 0, mini: Math.min(40, miniByW, miniByH), cols };

  const fixedW = 4 * GAP + SIDE_GAP + cols * (4 * MINI_GAP + LABEL_SLACK) + (cols - 1) * GRID_GAP;
  let tile = (w - fixedW) / (5 + 5 * cols * RATIO); // with minis at the full ratio
  let mini = RATIO * tile;
  if (mini > miniByH) {
    // Too tall: shrink the minis and give the width back to your board.
    mini = miniByH;
    tile = (w - fixedW - 5 * cols * mini) / 5;
  }
  tile = Math.min(tile, MAX_TILE, (h - 5 * GAP) / 6);
  return { tile, mini: Math.min(mini, RATIO * tile), cols };
}

// Biggest board for you first, then for them; minis too small to read are a last resort.
const value = (c, mine) => (mine ? c.tile : 0) + c.mini / 100 - (c.mini && c.mini < 12 ? 100 : 0);

/**
 * Returns a ref callback for the boards container. While attached, it sizes the tiles
 * (CSS vars --tile and --mini, plus --opp-cols for the grid of other boards) so the
 * boards fill the container.
 *   opps   how many other players' boards are shown (0–3)
 *   mine   false when you're only watching, so there's no board of your own
 *   notes  whether the other boards have a note line under them
 */
export function useFitTiles({ opps = 0, badges = false, mine = true, notes = false } = {}) {
  return useCallback(
    (el) => {
      if (!el) return;
      const fit = () => {
        const w = el.clientWidth - PAD;
        const h = el.clientHeight - PAD;
        if (w <= 0 || h <= 0) return;
        const options = opps
          ? Array.from({ length: opps }, (_, i) => layout(w, h, opps, i + 1, mine, LABEL + (notes ? NOTE : 0)))
          : [{ tile: Math.min(MAX_TILE, (h - 5 * GAP) / 6, (w - 4 * GAP - (badges ? 44 : 0)) / 5), mini: 0, cols: 1 }];
        const best = options.reduce((a, b) => (value(b, mine) > value(a, mine) ? b : a));
        el.style.setProperty('--tile', `${Math.floor(Math.max(26, best.tile))}px`);
        el.style.setProperty('--mini', `${Math.floor(Math.max(9, best.mini))}px`);
        el.style.setProperty('--opp-cols', String(best.cols));
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return () => ro.disconnect();
    },
    [opps, badges, mine, notes],
  );
}
