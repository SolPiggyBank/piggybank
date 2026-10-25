import { useCallback, useEffect, useRef } from 'preact/hooks';

// Segmented controls (.seg): a pill glides under the chosen option instead of
// jumping. The pill is the control's ::before, placed with CSS variables, so
// Preact's markup stays untouched; the first placement is instant.

const ACTIVE = ':scope > .on, :scope > [aria-checked="true"], :scope > [aria-selected="true"]';

export function attachGlider(el) {
  let raf = 0;
  function place(animate) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const on = el.querySelector(ACTIVE);
      if (!on || !on.offsetWidth) {
        el.classList.remove('has-glider');
        return;
      }
      if (!animate || !el.classList.contains('has-glider')) el.classList.add('glide-now');
      el.style.setProperty('--g-x', `${on.offsetLeft}px`);
      el.style.setProperty('--g-y', `${on.offsetTop}px`);
      el.style.setProperty('--g-w', `${on.offsetWidth}px`);
      el.style.setProperty('--g-h', `${on.offsetHeight}px`);
      el.classList.add('has-glider');
      if (el.classList.contains('glide-now')) requestAnimationFrame(() => el.classList.remove('glide-now'));
    });
  }
  place(false);
  const mo = new MutationObserver(() => place(true));
  mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-checked', 'aria-selected'] });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place(false)) : null;
  ro?.observe(el);
  return () => {
    cancelAnimationFrame(raf);
    mo.disconnect();
    ro?.disconnect();
  };
}

/** `<div class="seg" ref={useGlider()}>` */
export function useGlider() {
  const state = useRef({ el: null, off: null });
  const cb = useCallback((el) => {
    const st = state.current;
    if (el === st.el) return;
    st.off?.();
    st.off = null;
    st.el = el;
    if (el) st.off = attachGlider(el);
  }, []);
  useEffect(() => () => state.current.off?.(), []);
  return cb;
}
