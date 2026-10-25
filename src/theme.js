// Light / dark theme. `pref` is the user's choice ('auto' follows the system);
// the resolved theme lives on <html data-theme>, which the CSS keys off.
// public/theme-init.js applies the same choice before the first paint, from the
// localStorage mirror, so the popup never flashes the wrong colours.
const KEY = 'piggy-theme';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let pref = readMirror();

function readMirror() {
  try {
    return localStorage.getItem(KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveTheme(p = pref) {
  if (p === 'light' || p === 'dark') return p;
  return mq?.matches ? 'dark' : 'light';
}

export function currentTheme() {
  return document.documentElement.dataset.theme || resolveTheme();
}

/** Applies a preference. `animate` cross-fades colours (skipped with reduced motion). */
export function applyTheme(p, { animate = false } = {}) {
  pref = p === 'light' || p === 'dark' ? p : 'auto';
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // storage blocked: the theme still applies for this session
  }
  const root = document.documentElement;
  const next = resolveTheme(pref);
  if (root.dataset.theme === next) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (animate && !reduce) {
    root.classList.add('theme-anim');
    clearTimeout(applyTheme.timer);
    applyTheme.timer = setTimeout(() => root.classList.remove('theme-anim'), 450);
  }
  root.dataset.theme = next;
}

mq?.addEventListener?.('change', () => {
  if (pref === 'auto') applyTheme('auto', { animate: true });
});
