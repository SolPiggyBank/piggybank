import { useCallback, useEffect, useRef } from 'preact/hooks';

// Horizontal rails (goal templates, the goals rail, the goal picker) scroll by
// dragging with the mouse, like on a phone: momentum after release, a gentle
// snap to the nearest card, and a dragged-over card is not "clicked". A plain
// mouse wheel scrolls them sideways too. Touch and trackpads keep their native
// scrolling; keyboard focus still brings a card into view.
// The rail also gets .fade-l / .fade-r while there is more content on that side.

const THRESHOLD = 5; // px of movement before a press becomes a drag
const FRICTION = 0.94; // momentum decay per 16 ms
const MIN_SPEED = 0.03; // px/ms

// When the page itself was scrolling a moment ago, a wheel turn over a rail
// keeps scrolling the page: the rail only takes the wheel when you start on it.
let lastPageScroll = 0;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'scroll',
    (e) => {
      if (!e.target?.classList?.contains('can-drag')) lastPageScroll = performance.now();
    },
    { capture: true, passive: true },
  );
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function attachDragScroll(el) {
  let down = null; // { x, y, left, id }
  let dragging = false;
  let suppressClick = false;
  let samples = [];
  let raf = 0;
  let snapTimer = 0;
  const hadSnap = getComputedStyle(el).scrollSnapType !== 'none';

  const maxLeft = () => el.scrollWidth - el.clientWidth;

  function updateFades() {
    const max = maxLeft();
    const scrollable = max > 1;
    el.classList.toggle('can-drag', scrollable);
    el.classList.toggle('fade-l', scrollable && el.scrollLeft > 2);
    el.classList.toggle('fade-r', scrollable && el.scrollLeft < max - 2);
  }

  function stopMomentum() {
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(snapTimer);
  }

  function finish(at = el.scrollLeft) {
    if (!hadSnap) {
      el.classList.remove('dragging');
      return;
    }
    // ease to the nearest card before snapping comes back on, so it never jumps
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const box = el.getBoundingClientRect().left;
    let best = el.scrollLeft;
    let dist = Infinity; // distance from `at` to the closest card start
    for (const child of el.children) {
      const childAt = child.getBoundingClientRect().left - box + el.scrollLeft - pad;
      const left = Math.min(Math.max(childAt, 0), maxLeft());
      const d = Math.abs(left - at);
      if (d < dist) {
        dist = d;
        best = left;
      }
    }
    if (Math.abs(best - el.scrollLeft) < 1) {
      el.classList.remove('dragging');
      return;
    }
    el.scrollTo({ left: best, behavior: reducedMotion() ? 'auto' : 'smooth' });
    snapTimer = setTimeout(() => el.classList.remove('dragging'), reducedMotion() ? 0 : 380);
  }

  function momentum(v) {
    // our own float position: scrollLeft may round tiny per-frame steps away
    let pos = el.scrollLeft;
    let last = null;
    const step = (now) => {
      if (last === null) {
        last = now;
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(Math.max(now - last, 0), 32);
      last = now;
      pos -= v * dt;
      const max = maxLeft();
      const edge = pos <= 0 || pos >= max;
      pos = Math.min(Math.max(pos, 0), max);
      el.scrollLeft = pos;
      v *= Math.pow(FRICTION, dt / 16);
      if (edge || Math.abs(v) < MIN_SPEED) {
        raf = 0;
        finish();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function onDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (maxLeft() <= 1) return;
    const wasMoving = raf !== 0;
    stopMomentum();
    down = { x: e.clientX, y: e.clientY, left: el.scrollLeft, id: e.pointerId, wasMoving };
    dragging = false;
    samples = [{ t: e.timeStamp, x: e.clientX }];
  }

  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(e.clientY - down.y)) return;
      dragging = true;
      el.classList.add('dragging');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
      window.getSelection?.()?.removeAllRanges();
    }
    e.preventDefault();
    el.scrollLeft = down.left - dx;
    samples.push({ t: e.timeStamp, x: e.clientX });
    if (samples.length > 6) samples.shift();
  }

  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const { wasMoving } = down;
    down = null;
    if (!dragging) {
      // a press that stopped a coasting rail only stops it, like on a phone
      if (wasMoving) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
      }
      if (el.classList.contains('dragging')) finish();
      return;
    }
    dragging = false;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0); // only the click that ends this drag
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const first = samples.find((s) => e.timeStamp - s.t < 100) || samples[0];
    const dt = e.timeStamp - first.t;
    const v = dt > 0 ? (e.clientX - first.x) / dt : 0;
    if (!reducedMotion() && Math.abs(v) > 0.15) momentum(Math.max(-4, Math.min(4, v)));
    else finish();
  }

  function onCancel() {
    if (!down) return;
    down = null;
    if (dragging) {
      dragging = false;
      finish();
    }
  }

  function onClick(e) {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  // A plain mouse wheel scrolls the rail sideways (no Shift needed). Trackpad
  // swipes are already horizontal and stay native; at either end the wheel
  // goes back to scrolling the page.
  let wheelTarget = null;
  function onWheel(e) {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const max = maxLeft();
    if (max <= 1) return;
    if (performance.now() - lastPageScroll < 350) return;
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientWidth : 1;
    const delta = e.deltaY * unit;
    const from = wheelTarget ?? el.scrollLeft;
    if ((delta < 0 && from <= 0) || (delta > 0 && from >= max)) return;
    e.preventDefault();
    stopMomentum();
    wheelTarget = Math.min(Math.max(from + delta, 0), max);
    el.classList.add('dragging');
    el.scrollTo({ left: wheelTarget, behavior: reducedMotion() ? 'auto' : 'smooth' });
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const target = wheelTarget;
      wheelTarget = null;
      finish(target);
    }, 260);
  }

  // a native drag of a link or image would steal the gesture
  const onDragStart = (e) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('lostpointercapture', onCancel);
  el.addEventListener('click', onClick, true);
  el.addEventListener('dragstart', onDragStart);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('scroll', updateFades, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateFades) : null;
  ro?.observe(el);
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(updateFades) : null;
  mo?.observe(el, { childList: true, subtree: true, characterData: true });
  updateFades();
  // the selected item (e.g. the goal being topped up) starts in view
  const selected = el.querySelector('[aria-checked="true"], .on');
  if (selected && maxLeft() > 1) {
    const r = selected.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (r.right > box.right || r.left < box.left) el.scrollLeft += r.left - box.left - (box.width - r.width) / 2;
  }

  return () => {
    stopMomentum();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('lostpointercapture', onCancel);
    el.removeEventListener('click', onClick, true);
    el.removeEventListener('dragstart', onDragStart);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('scroll', updateFades);
    ro?.disconnect();
    mo?.disconnect();
  };
}

/**
 * `<div class="jar-rail" ref={useDragScroll()}>` — a callback ref, so it follows
 * the element when it is re-created (e.g. a sheet switching layouts).
 */
export function useDragScroll() {
  const state = useRef({ el: null, off: null });
  const cb = useCallback((el) => {
    const st = state.current;
    if (el === st.el) return;
    st.off?.();
    st.off = null;
    st.el = el;
    if (el) st.off = attachDragScroll(el);
  }, []);
  useEffect(() => () => state.current.off?.(), []);
  return cb;
}
