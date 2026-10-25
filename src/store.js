import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS } from './lib/config.js';

let state = {
  booting: true,
  wallet: null, // { publicKey, type: 'mnemonic'|'privateKey', path, backedUp, createdAt }
  vault: null,
  unlocked: false,
  settings: { ...DEFAULT_SETTINGS },
  goals: [],
  activity: [],
  balances: null,
  balancesStatus: 'idle',
  balancesError: null,
  prices: { SOL: null, USDC: 1, USDT: 1 },
  depositInbox: [],
  pendingTxs: [],
  history: null,
  historyStatus: 'idle',
  route: { name: 'welcome', params: {} },
  stack: [],
  direction: 'none',
  sheet: null, // { name, params }
  toast: null,
  onboarding: {}, // temporary data during wallet creation, never persisted
  celebrate: 0,
  dropKey: 0,
};

const subs = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  subs.forEach((f) => f());
}

export function useAppState() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  return state;
}

// ---- navigation -------------------------------------------------------

const TABS = new Set(['home', 'goals', 'history']);

export function navigate(name, params = {}) {
  setState((s) => ({ stack: [...s.stack, s.route], route: { name, params }, direction: 'forward', sheet: null }));
}

export function replace(name, params = {}) {
  const isTab = TABS.has(name);
  setState(() => ({ route: { name, params }, direction: isTab ? 'none' : 'fade', stack: [], sheet: null }));
}

export function back() {
  setState((s) => {
    if (!s.stack.length) return { route: { name: 'home', params: {} }, direction: 'back' };
    const stack = s.stack.slice(0, -1);
    return { route: s.stack[s.stack.length - 1], stack, direction: 'back' };
  });
}

export function openSheet(name, params = {}) {
  setState({ sheet: { name, params }, toast: null });
}

export function closeSheet() {
  setState({ sheet: null });
}

let toastTimer;
export function toast(text, kind = 'info') {
  clearTimeout(toastTimer);
  setState({ toast: { text, kind, id: Date.now() } });
  toastTimer = setTimeout(() => setState({ toast: null }), kind === 'milestone' ? 3600 : 2600);
}
