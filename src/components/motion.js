import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks';

// Small motion helpers so things move instead of jumping:
// - useFlip: rows that change place slide there (FLIP)
// - useSpin: a refresh icon that spins while busy and eases to a stop
// - exitGhost: a disappearing overlay (sheet, toast) fades out instead of vanishing
// - revealIn / collapseOut: a block grows open or folds away

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.2, 0.8, 0.25, 1)';

/** Where each [data-flip] element is, relative to its nearest [data-flip] parent (or the root). */
function measure(root) {
  const map = new Map();
  const rootTop = root.getBoundingClientRect().top;
  root.querySelectorAll('[data-flip]').forEach((n) => {
    const parent = n.parentElement?.closest('[data-flip]');
    const base = parent && root.contains(parent) ? parent.getBoundingClientRect().top : rootTop;
    map.set(n.dataset.flip, n.getBoundingClientRect().top - base);
  });
  return map;
}

/**
 * `<div ref={useFlip()}>` with `data-flip="key"` on the things that may move.
 * Positions are read during render (the old layout, mid-animation included)
 * and after the update; anything that moved slides from where it was.
 */
export function useFlip() {
  const root = useRef(null);
  const before = useRef(null);
  if (root.current && !reducedMotion()) before.current = measure(root.current);
  useLayoutEffect(() => {
    const el = root.current;
    const was = before.current;
    before.current = null;
    if (!el || !was) return;
    const nodes = [...el.querySelectorAll('[data-flip]')];
    for (const n of nodes) for (const a of n.getAnimations?.() || []) if (a.id === 'flip') a.cancel();
    const now = measure(el);
    for (const n of nodes) {
      const a = was.get(n.dataset.flip);
      const b = now.get(n.dataset.flip);
      if (a == null || b == null || Math.abs(a - b) < 1) continue;
      const anim = n.animate([{ transform: `translateY(${a - b}px)` }, { transform: 'translateY(0)' }], {
        duration: 440,
        easing: EASE,
      });
      anim.id = 'flip';
    }
  });
  return root;
}

/** A ref for an icon that spins while `active` and eases to a stop when done. */
export function useSpin(active) {
  const ref = useRef(null);
  const anim = useRef(null);
  const TURN = 760;
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !el.animate) return;
    if (active) {
      if (anim.current?.spinning) return;
      anim.current?.cancel();
      const a = el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: TURN,
        iterations: Infinity,
      });
      a.spinning = true;
      anim.current = a;
    } else if (anim.current?.spinning) {
      const a = anim.current;
      const angle = (((a.currentTime || 0) % TURN) / TURN) * 360;
      a.cancel();
      // finish this turn and coast a little past it
      anim.current = el.animate(
        [{ transform: `rotate(${angle}deg)` }, { transform: 'rotate(380deg)', offset: 0.8 }, { transform: 'rotate(360deg)' }],
        { duration: 380 + ((360 - angle) / 360) * 420, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)' },
      );
    }
  }, [active]);
  useEffect(() => () => anim.current?.cancel(), []);
  return ref;
}

/**
 * Plays an exit for an overlay that is about to be removed: a copy of its DOM
 * is left in place with `leaving` on it, then dropped once the CSS exit ends.
 */
export function exitGhost(node, ms = 240, into = node?.parentElement) {
  if (!node || reducedMotion() || !node.isConnected || !into) return;
  const ghost = node.cloneNode(true);
  ghost.classList.add('leaving');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  if (into === node.parentElement) into.insertBefore(ghost, node.nextSibling);
  else into.appendChild(ghost);
  setTimeout(() => ghost.remove(), ms);
}

/** Grows a freshly shown block open from nothing. */
export function revealIn(el, { duration = 320 } = {}) {
  if (!el || reducedMotion() || !el.animate) return;
  const h = el.offsetHeight;
  if (!h) return;
  const prev = el.style.overflow;
  el.style.overflow = 'hidden';
  const cs = getComputedStyle(el);
  const a = el.animate(
    [
      { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
      { height: `${h}px`, opacity: 1, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
    ],
    { duration, easing: EASE },
  );
  a.onfinish = a.oncancel = () => {
    el.style.overflow = prev;
  };
}

/** Folds a block away, then calls `done` (right away when motion is reduced). */
export function collapseOut(el, done, { duration = 260 } = {}) {
  if (!el || reducedMotion() || !el.animate) return done();
  const h = el.offsetHeight;
  const cs = getComputedStyle(el);
  el.style.overflow = 'hidden';
  el.style.pointerEvents = 'none';
  const a = el.animate(
    [
      { height: `${h}px`, opacity: 1, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', transform: 'scale(0.97)' },
    ],
    { duration, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
  );
  a.onfinish = () => done();
}

/** A callback ref that grows its element open when it appears (not on the screen's first paint). */
export function useRevealRef({ skipFirst = false } = {}) {
  const first = useRef(skipFirst);
  const seen = useRef(null);
  return useCallback((el) => {
    if (!el || el === seen.current) return;
    seen.current = el;
    if (first.current) {
      first.current = false;
      return;
    }
    revealIn(el);
  }, []);
}
