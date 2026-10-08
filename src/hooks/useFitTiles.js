import { useCallback } from 'react';

/**
 * Returns a ref callback for the boards container. While attached, it sizes the tiles
 * (CSS vars --tile and --mini) so the board(s) fill the container.
 */
export function useFitTiles({ withOpp = false, badges = false } = {}) {
  return useCallback(
    (el) => {
      if (!el) return;
      const fit = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        const gap = 5;
        const ratio = 0.42; // opponent tiles relative to yours
        const byHeight = (h - 5 * gap - 12) / 6;
        const byWidth = withOpp
          ? (w - 4 * gap - 12 - 32) / (5 + 5 * ratio)
          : (w - 4 * gap - (badges ? 56 : 12)) / 5;
        const tile = Math.floor(Math.max(26, Math.min(62, byHeight, byWidth)));
        el.style.setProperty('--tile', `${tile}px`);
        el.style.setProperty('--mini', `${Math.max(13, Math.floor(tile * ratio))}px`);
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return () => ro.disconnect();
    },
    [withOpp, badges],
  );
}
