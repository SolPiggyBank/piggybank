import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { getState, setState, replace, toast, openSheet } from './store.js';
import { local, session, getOne, isExtension } from './lib/storage.js';
import { encryptVault, decryptVault } from './lib/vault.js';
import { keypairFromSecret, keypairFromMnemonic, DERIVATION_PATHS, DEFAULT_PATH } from './lib/keys.js';
import { DEFAULT_SETTINGS, rpcList, SOL_FEE_RESERVE, SWAP, TOKENS, GENESIS } from './lib/config.js';
import { fetchBalances, setRpcHealth, rpcHealth, checkNodes } from './lib/rpc.js';
import { fetchPrices } from './lib/prices.js';
import { reconcileBalances, expectIncoming } from './lib/deposits.js';
import { recipientRisk } from './lib/poison.js';
import {
  allocatedByToken,
  goalAlloc,
  goalProgress,
  lockedByToken,
  hasActiveLocks,
  smartOpen,
  milestoneCrossed,
  withReached,
  goalHoldsMoney,
} from './lib/goals-math.js';
import { t, setLang, detectLang } from './i18n.js';
import { applyTheme } from './theme.js';
import {
  sendTransfer,
  toBaseUnits,
  confirmSignature,
  getSignatureStatus,
  fetchHistory,
  requestAirdrop as rpcAirdrop,
} from './lib/solana.js';

let keypair = null; // lives only in memory (and chrome.storage.session while unlocked)

export function getKeypair() {
  return keypair;
}

function endpoints() {
  return rpcList(getState().settings);
}

function net() {
  return getState().settings.network;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---- boot / lock -------------------------------------------------------

export async function boot() {
  const data = await local.get(['wallet', 'vault', 'settings', 'goals', 'activity', 'depositInbox', 'pendingTxs', 'lastPrices', 'rpcHealth']);
  setRpcHealth(data.rpcHealth);
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  settings.customRpc = { ...DEFAULT_SETTINGS.customRpc, ...(settings.customRpc || {}) };
  setLang(detectLang(settings.language));
  applyTheme(settings.theme);
  setState({
    wallet: data.wallet || null,
    vault: data.vault || null,
    settings,
    goals: data.goals || [],
    activity: data.activity || [],
    depositInbox: data.depositInbox || [],
    pendingTxs: data.pendingTxs || [],
    // stablecoins count as exactly $1 (older versions stored market quotes)
    prices: { ...(data.lastPrices || getState().prices), USDC: 1, USDT: 1 },
  });

  if (isExtension) chrome.runtime.sendMessage({ type: 'popup-opened' }).catch(() => {});

  if (!data.wallet || !data.vault) {
    setState({ booting: false });
    replace('welcome');
    return;
  }

  const unlocked = await getOne(session, 'unlocked');
  const expired =
    unlocked && settings.autoLockMinutes && Date.now() - (unlocked.lastActive || 0) > settings.autoLockMinutes * 60_000;
  if (unlocked && !expired && unlocked.publicKey === data.wallet.publicKey) {
    try {
      keypair = Keypair.fromSecretKey(bs58.decode(unlocked.secretKey));
      await touch(true);
      setState({ unlocked: true, booting: false });
      replace('home');
      afterUnlock();
      return;
    } catch {
      /* fall through to the lock screen */
    }
  }
  if (expired) await session.remove('unlocked');
  setState({ booting: false, unlocked: false });
  replace('unlock');
}

let lastTouch = 0;
export async function touch(force = false) {
  if (!keypair) return;
  const now = Date.now();
  if (!force && now - lastTouch < 15_000) return;
  lastTouch = now;
  await session.set({
    unlocked: { secretKey: bs58.encode(keypair.secretKey), publicKey: keypair.publicKey.toBase58(), lastActive: now },
  });
}

async function startSession(kp) {
  keypair = kp;
  await touch(true);
  setState({ unlocked: true });
}

/** `beforeEnter` lets the unlock screen finish its wake-up moment while balances load. */
export async function unlock(password, { beforeEnter } = {}) {
  const { vault, wallet } = getState();
  const secret = await decryptVault(vault, password); // throws bad-password
  const kp = keypairFromSecret(secret);
  if (kp.publicKey.toBase58() !== wallet.publicKey) throw new Error('mismatch');
  await startSession(kp);
  afterUnlock();
  if (beforeEnter) await beforeEnter().catch(() => {});
  replace('home');
}

export async function lock() {
  keypair = null;
  await session.remove('unlocked');
  setState({ unlocked: false, balances: null, history: null, sheet: null });
  replace('unlock');
}

function afterUnlock() {
  refresh();
  checkPending();
  syncAllLocks();
  refreshNodeHealth().catch(() => {});
}

/**
 * Pings every node of the current network (at most every 20 minutes unless
 * forced) so requests go to the fastest one that answers. Results are kept in
 * storage for the next popup and for the background worker.
 */
export async function refreshNodeHealth({ force = false, onEach } = {}) {
  const st = getState().settings;
  const nodes = rpcList(st);
  const known = rpcHealth();
  if (!force && nodes.every((u) => known[u] && Date.now() - known[u].ts < 20 * 60_000)) return null;
  const res = await checkNodes(nodes, GENESIS[st.network], onEach);
  await local.set({ rpcHealth: rpcHealth() });
  return res;
}

/** Checks open smart-contract locks of every goal once per session. */
async function syncAllLocks() {
  const network = net();
  for (const g of getState().goals) {
    if ((g.locks?.[network] || []).some((l) => l.status !== 'withdrawn')) {
      await syncGoalLocks(g.id).catch(() => {});
    }
  }
}

// ---- wallet creation ---------------------------------------------------

/**
 * secret: { type: 'mnemonic', mnemonic, path } | { type: 'privateKey', secretKey }
 */
export async function createWallet(secret, password, { backedUp }) {
  const kp = keypairFromSecret(secret);
  const vault = await encryptVault(secret, password);
  const wallet = {
    publicKey: kp.publicKey.toBase58(),
    type: secret.type,
    path: secret.path || null,
    backedUp: !!backedUp,
    createdAt: Date.now(),
  };
  await local.set({ vault, wallet, knownBalances: {}, depositInbox: [], historyCache: {} });
  setState({ vault, wallet, onboarding: {}, depositInbox: [], balances: null, history: null });
  await startSession(kp);
}

/**
 * For an imported seed phrase, pick the derivation path that already holds
 * funds; default to the Phantom path when nothing is found or offline.
 */
export async function discoverPath(mnemonic) {
  const eps = endpoints();
  for (const path of DERIVATION_PATHS) {
    const kp = keypairFromMnemonic(mnemonic, path);
    try {
      const b = await fetchBalances(eps, kp.publicKey.toBase58(), net());
      if (b.SOL > 0 || b.USDC > 0 || b.USDT > 0) return path;
    } catch {
      return DEFAULT_PATH;
    }
  }
  return DEFAULT_PATH;
}

export async function markBackedUp() {
  const wallet = { ...getState().wallet, backedUp: true };
  await local.set({ wallet });
  setState({ wallet });
}

export async function revealSecret(password) {
  const secret = await decryptVault(getState().vault, password);
  const kp = keypairFromSecret(secret);
  return { ...secret, privateKey: bs58.encode(kp.secretKey) };
}

export async function changePassword(oldPw, newPw) {
  const secret = await decryptVault(getState().vault, oldPw);
  const vault = await encryptVault(secret, newPw);
  await local.set({ vault });
  setState({ vault });
}

export async function resetWallet() {
  keypair = null;
  await session.remove('unlocked');
  await local.remove([
    'vault',
    'wallet',
    'goals',
    'activity',
    'knownBalances',
    'depositInbox',
    'pendingTxs',
    'expectedIncoming',
    'unlockNotified',
    'historyCache',
  ]);
  setState({
    wallet: null,
    vault: null,
    unlocked: false,
    goals: [],
    activity: [],
    balances: null,
    history: null,
    depositInbox: [],
    pendingTxs: [],
    stack: [],
    sheet: null,
  });
  replace('welcome');
}

// ---- balances ----------------------------------------------------------

let refreshing = null;
let lastPriceFetch = 0;
export function refresh({ silent = false } = {}) {
  if (refreshing) return refreshing;
  const { wallet, settings } = getState();
  if (!wallet) return Promise.resolve();
  if (!silent) setState({ balancesStatus: getState().balances ? 'refreshing' : 'loading' });
  refreshing = (async () => {
    const network = settings.network;
    const needPrices = Date.now() - lastPriceFetch > 60_000;
    if (needPrices) lastPriceFetch = Date.now();
    const [balRes, priceRes] = await Promise.allSettled([
      fetchBalances(endpoints(), wallet.publicKey, network),
      needPrices ? fetchPrices() : Promise.reject(new Error('skip')),
    ]);
    if (priceRes.status === 'fulfilled') {
      const prices = priceRes.value;
      if (prices.SOL == null) prices.SOL = getState().prices.SOL;
      setState({ prices });
      if (prices.ts) local.set({ lastPrices: prices });
      await syncReached().catch(() => {}); // never in the way of the balance refresh
    }
    if (balRes.status === 'fulfilled') {
      if (getState().settings.network !== network) return; // network switched mid-flight
      const balances = balRes.value;
      setState({ balances, balancesStatus: 'ok', balancesError: null });
      const events = await reconcileBalances(network, wallet.publicKey, balances);
      if (events.length) {
        setState({ depositInbox: await getOne(local, 'depositInbox', []) });
      }
    } else {
      setState({ balancesStatus: 'error', balancesError: balRes.reason?.message || 'network' });
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Spendable/allocatable amounts per token after what is put aside in goals. */
export function computeFunds(state = getState()) {
  const b = state.balances || { SOL: 0, USDC: 0, USDT: 0 };
  const allocated = allocatedByToken(state.goals, state.settings.network);
  const free = {};
  const shortfall = {};
  for (const t of ['SOL', 'USDC', 'USDT']) {
    free[t] = Math.max(0, (b[t] || 0) - allocated[t]);
    shortfall[t] = state.balances ? Math.max(0, allocated[t] - (b[t] || 0)) : 0;
  }
  // A little SOL always stays out of goals and transfers: it pays network fees.
  const sendable = { ...free, SOL: Math.max(0, free.SOL - SOL_FEE_RESERVE) };
  // Tokens sitting in smart-contract locks are not in the wallet but still ours.
  const locked = lockedByToken(state.goals, state.settings.network);
  const p = state.prices;
  const usd = (o) => (o.USDC || 0) * (p.USDC ?? 1) + (o.USDT || 0) * (p.USDT ?? 1) + (o.SOL || 0) * (p.SOL ?? 0);
  return {
    balances: b,
    allocated,
    locked,
    free,
    sendable,
    allocatable: sendable,
    shortfall,
    hasShortfall: Object.values(shortfall).some((v) => v > 0.000001),
    totalUsd: usd(b) + usd(locked),
    allocatedUsd: usd(allocated) + usd(locked),
    lockedUsd: usd(locked),
    freeUsd: usd(free),
  };
}

/** Shrinks goal allocations when the wallet holds less than was put aside. */
export async function fixShortfall() {
  const s = getState();
  const network = s.settings.network;
  const allocated = allocatedByToken(s.goals, network);
  const goals = s.goals.map((g) => {
    const a = goalAlloc(g, network);
    for (const t of ['SOL', 'USDC', 'USDT']) {
      const have = s.balances?.[t] || 0;
      if (allocated[t] > have && allocated[t] > 0) {
        const f = 10 ** TOKENS[t].decimals;
        a[t] = Math.floor(((a[t] * have) / allocated[t]) * f) / f;
      }
    }
    return { ...g, allocations: { ...(g.allocations || {}), [network]: a } };
  });
  await saveGoals(goals);
  toast(t('home.shortfallFixed'));
}

// ---- goals -------------------------------------------------------------

async function saveGoals(goals) {
  const s = getState();
  // "lock until reached" remembers that a goal was reached (and forgets it once the goal is empty)
  goals = goals.map((g) => withReached(g, s.prices, s.settings.network));
  setState({ goals });
  await local.set({ goals });
}

/**
 * A goal can fill up without a top-up, when SOL gets dearer. Then it is reached
 * like any other: its lock comes off for good, and it gets its celebration.
 */
async function syncReached() {
  const s = getState();
  if (!s.unlocked) return;
  const network = s.settings.network;
  let done = null;
  const goals = s.goals.map((g) => {
    let n = withReached(g, s.prices, network);
    if (!g.smart && goalHoldsMoney(g, network) && goalProgress(g, s.prices, network) >= 1 && !g.celebrated?.[network]) {
      n = { ...n, celebrated: { ...(g.celebrated || {}), [network]: Date.now() } };
      done = done || n;
    }
    return n;
  });
  if (goals.every((g, i) => g === s.goals[i])) return;
  await saveGoals(goals);
  if (done) {
    await logActivity({ type: 'goal-completed', goalId: done.id, goalName: done.name, emoji: done.emoji });
    if (!getState().sheet) openSheet('goal-done', { goalId: done.id });
  }
}

async function logActivity(entry) {
  const activity = [{ id: uid(), ts: Date.now(), network: net(), ...entry }, ...getState().activity].slice(0, 200);
  setState({ activity });
  await local.set({ activity });
}

export async function saveGoal(data) {
  const goals = [...getState().goals];
  if (data.id) {
    const i = goals.findIndex((g) => g.id === data.id);
    const prev = goals[i];
    const next = { ...prev, ...data };
    // a raised target, or the lock switched on, starts a new round of "lock until reached"
    if (next.locked && (!prev.locked || next.target > prev.target)) next.reachedAt = {};
    goals[i] = next;
    await saveGoals(goals);
    return getState().goals[i];
  }
  const goal = { id: uid(), createdAt: Date.now(), allocations: {}, celebrated: {}, ...data };
  goals.push(goal);
  await saveGoals(goals);
  await logActivity({ type: 'goal-created', goalId: goal.id, goalName: goal.name, emoji: goal.emoji });
  return goal;
}

export async function deleteGoal(id) {
  const goal = getState().goals.find((g) => g.id === id);
  // Money still sitting in a smart contract must be withdrawn first, otherwise
  // the goal (and the record of where the money is) would disappear.
  if (goal && ['mainnet', 'devnet'].some((n) => hasActiveLocks(goal, n))) throw new Error('has-locks');
  await saveGoals(getState().goals.filter((g) => g.id !== id));
}

/** Moves free money into a goal. Returns { completedNow, milestone } (milestone: 25 | 50 | 75 | null). */
export async function allocate(goalId, token, amount) {
  const s = getState();
  const network = s.settings.network;
  const funds = computeFunds(s);
  if (!(amount > 0) || amount > funds.allocatable[token] + 1e-9) throw new Error('not-enough-free');
  let completedNow = false;
  let milestone = null;
  const goals = s.goals.map((g) => {
    if (g.id !== goalId) return g;
    const before = goalProgress(g, s.prices, network);
    const a = goalAlloc(g, network);
    a[token] = +(a[token] + amount).toFixed(TOKENS[token].decimals);
    const updated = { ...g, allocations: { ...(g.allocations || {}), [network]: a } };
    const after = goalProgress(updated, s.prices, network);
    if (before < 1 && after >= 1 && !g.celebrated?.[network]) {
      completedNow = true;
      updated.celebrated = { ...(g.celebrated || {}), [network]: Date.now() };
    }
    milestone = milestoneCrossed(before, after);
    return updated;
  });
  await saveGoals(goals);
  const goal = goals.find((g) => g.id === goalId);
  await logActivity({ type: 'allocate', goalId, goalName: goal.name, emoji: goal.emoji, token, amount });
  if (completedNow) await logActivity({ type: 'goal-completed', goalId, goalName: goal.name, emoji: goal.emoji });
  setState((st) => ({ dropKey: st.dropKey + 1, celebrate: completedNow ? st.celebrate + 1 : st.celebrate }));
  return { completedNow, milestone: completedNow ? null : milestone };
}

export async function release(goalId, token, amount) {
  const s = getState();
  const network = s.settings.network;
  const goals = s.goals.map((g) => {
    if (g.id !== goalId) return g;
    const a = goalAlloc(g, network);
    a[token] = Math.max(0, +(a[token] - amount).toFixed(TOKENS[token].decimals));
    const updated = { ...g, allocations: { ...(g.allocations || {}), [network]: a } };
    if (goalProgress(updated, s.prices, network) < 1 && g.celebrated?.[network]) {
      updated.celebrated = { ...g.celebrated, [network]: null };
    }
    return updated;
  });
  await saveGoals(goals);
  const goal = goals.find((g) => g.id === goalId);
  await logActivity({ type: 'release', goalId, goalName: goal.name, emoji: goal.emoji, token, amount });
}

export async function dismissDeposit(id) {
  const depositInbox = getState().depositInbox.filter((d) => d.id !== id);
  setState({ depositInbox });
  await local.set({ depositInbox });
}

// ---- sending -----------------------------------------------------------

export async function send({ token, to, amount, recipient, onStage }) {
  const s = getState();
  if (!keypair) throw new Error('locked');
  // the form checked this too, but balances may have changed since
  if (!(Number(amount) > 0) || Number(amount) > computeFunds(s).sendable[token] + 1e-9) throw new Error('not-enough-free');
  onStage?.('signing');
  const res = await sendTransfer({
    endpoints: endpoints(),
    network: s.settings.network,
    keypair,
    token,
    to,
    amount,
    recipient,
    sourceAccounts: s.balances?.accounts?.[token],
  });
  const pending = { signature: res.signature, token, amount, to, ts: Date.now(), network: s.settings.network };
  await savePending([pending, ...getState().pendingTxs]);
  onStage?.('confirming', res.signature);
  try {
    await confirmSignature(endpoints(), res.signature, res);
    await savePending(getState().pendingTxs.filter((p) => p.signature !== res.signature));
    await logActivity({ type: 'send', token, amount, to, signature: res.signature });
    markHistoryStale();
    refresh({ silent: true });
    return res.signature;
  } catch (e) {
    if (e.code === 'expired' || e.code === 'tx-failed') {
      await savePending(getState().pendingTxs.filter((p) => p.signature !== res.signature));
    }
    e.signature = res.signature;
    throw e;
  }
}

/** Look-alike and spam-only recipients, judged by this wallet's own history. */
export async function recipientRiskFor(to) {
  const s = getState();
  const network = s.settings.network;
  let entries = s.history?.network === network ? s.history.entries : null;
  if (!entries) {
    const cached = (await getOne(local, 'historyCache'))?.[network];
    entries = cached?.owner === s.wallet.publicKey ? cached.entries || [] : [];
  }
  return recipientRisk(to, { owner: s.wallet.publicKey, activity: s.activity, entries });
}

async function savePending(pendingTxs) {
  setState({ pendingTxs });
  await local.set({ pendingTxs });
}

/** Re-checks transactions that were still in flight when the popup closed. */
export async function checkPending() {
  const list = getState().pendingTxs;
  if (!list.length) return;
  const keep = [];
  for (const p of list) {
    const st = await getSignatureStatus(rpcList({ ...getState().settings, network: p.network }), p.signature).catch(
      () => undefined,
    );
    if (st === undefined) {
      keep.push(p);
      continue;
    }
    if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
      if (p.kind === 'swap') {
        await logActivity({ type: 'swap', from: p.from, to: p.toToken, amount: p.amount, outAmount: p.outAmount, fee: p.fee, signature: p.signature, network: p.network });
      } else {
        await logActivity({ type: 'send', token: p.token, amount: p.amount, to: p.to, signature: p.signature, network: p.network });
      }
    } else if ((st && !st.err) || (!st && Date.now() - p.ts < 120_000)) {
      keep.push(p); // still "processed", or not visible yet
    }
  }
  await savePending(keep);
}

// ---- swaps (SOL ⇄ USDC ⇄ USDT through Jupiter, mainnet only) ------------

let swapModule;
async function swapLib() {
  if (!swapModule) swapModule = await import('./lib/swap.js');
  return swapModule;
}

/** Checks that `amount` of `from` is free (not in goals) and returns a simulated quote. */
export async function quoteSwap({ from, to, amount }) {
  const s = getState();
  if (s.settings.network !== 'mainnet') throw new Error('swap-mainnet-only');
  const num = Number(amount);
  if (!(num > 0) || num > computeFunds(s).sendable[from] + 1e-9) throw new Error('not-enough-free');
  if (num < SWAP.minAmount[from]) throw new Error('swap-too-small');
  const S = await swapLib();
  return S.quoteSwap({
    endpoints: endpoints(),
    network: s.settings.network,
    owner: s.wallet.publicKey,
    from,
    to,
    amount: String(amount),
    prices: s.prices,
    balances: s.balances,
  });
}

/** Jupiter's "slippage tolerance exceeded" (error 6001) reads as a moved price, not a program error. */
function swapSendError(e) {
  const text = `${e?.message || ''} ${JSON.stringify(e?.data || '')}`.toLowerCase();
  if (text.includes('0x1771') || text.includes('"custom":6001') || text.includes('slippage')) {
    return Object.assign(new Error('swap-slippage'), { signature: e.signature });
  }
  return e;
}

/**
 * Signs and sends a quote. A quote older than SWAP.quoteTtlMs is fetched again;
 * if the new one pays noticeably less, nothing is sent and the error carries it
 * (`swap-rate-changed`, e.quote) so the person can look before confirming.
 * Returns { signature, received, quote }.
 */
export async function swap({ quote, onStage }) {
  if (!keypair) throw new Error('locked');
  let q = quote;
  if (Date.now() - q.createdAt > SWAP.quoteTtlMs) {
    onStage?.('requoting');
    const fresh = await quoteSwap({ from: q.from, to: q.to, amount: q.amountText });
    if (fresh.outRaw * 1000n < q.outRaw * 997n) throw Object.assign(new Error('swap-rate-changed'), { quote: fresh });
    q = fresh;
  }
  const funds = computeFunds(getState());
  if (q.amountIn > funds.sendable[q.from] + 1e-9) throw new Error('not-enough-free');
  if (q.solNeeded > funds.sendable.SOL + 1e-9) throw new Error('swap-insufficient-sol');

  onStage?.('signing');
  const network = net();
  const S = await swapLib();
  // what the swap brings in is not a "deposit" to announce
  await expectIncoming(network, q.to, q.outAmount * 1.02);
  let res;
  try {
    res = await S.executeSwap({ endpoints: endpoints(), keypair, quote: q });
  } catch (e) {
    throw swapSendError(e);
  }
  const pending = {
    kind: 'swap',
    signature: res.signature,
    from: q.from,
    toToken: q.to,
    token: q.from,
    amount: q.amountIn,
    outAmount: q.outAmount,
    fee: q.fee,
    ts: Date.now(),
    network,
  };
  await savePending([pending, ...getState().pendingTxs]);
  onStage?.('confirming', res.signature);
  try {
    await confirmSignature(endpoints(), res.signature, res);
  } catch (e) {
    if (e.code === 'expired' || e.code === 'tx-failed') {
      await savePending(getState().pendingTxs.filter((p) => p.signature !== res.signature));
    }
    const err = swapSendError(e);
    err.signature = res.signature;
    throw err;
  }
  await savePending(getState().pendingTxs.filter((p) => p.signature !== res.signature));
  const received =
    (await S.swapResult({ endpoints: endpoints(), signature: res.signature, owner: keypair.publicKey.toBase58(), network, to: q.to, rentSol: q.rentSol }).catch(
      () => null,
    )) ?? q.outAmount;
  await logActivity({
    type: 'swap',
    from: q.from,
    to: q.to,
    amount: q.amountIn,
    outAmount: received,
    fee: q.fee,
    signature: res.signature,
  });
  markHistoryStale();
  refresh({ silent: true });
  return { signature: res.signature, received, quote: q };
}

export async function airdrop() {
  const sig = await rpcAirdrop(endpoints(), getState().wallet.publicKey, 1);
  await confirmSignature(endpoints(), sig, { timeoutMs: 60_000 });
  await refresh({ silent: true });
  return sig;
}

// ---- smart-contract locks ------------------------------------------------
// New locks go to Jupiter Lock (no protocol fee). Locks made by v1.1 through
// Streamflow have no `provider` field and keep working through locker.js.

let jupModule;
async function jupiter() {
  if (!jupModule) jupModule = await import('./lib/jupiter-lock.js');
  return jupModule;
}
let streamflowModule;
async function streamflow() {
  if (!streamflowModule) streamflowModule = await import('./lib/locker.js');
  return streamflowModule;
}
const providerOf = (lock) => lock.provider || 'streamflow';

async function updateGoalLocks(goalId, network, fn) {
  const goals = getState().goals.map((g) => {
    if (g.id !== goalId) return g;
    const locks = fn([...(g.locks?.[network] || [])]);
    return { ...g, locks: { ...(g.locks || {}), [network]: locks } };
  });
  await saveGoals(goals);
  return goals.find((g) => g.id === goalId);
}

/** What locking `amount` of `token` costs: no protocol fee, a refundable storage deposit and the network fee. */
export async function quoteLock(token, amount) {
  const J = await jupiter();
  return J.getLockQuote({ endpoints: endpoints(), network: net(), token, amount });
}

/**
 * Locks free tokens in a Jupiter Lock escrow until the goal's unlock date.
 * Returns { signature, completedNow }.
 */
export async function lockToGoal({ goalId, token, amount, quote, onStage }) {
  const s = getState();
  const network = net();
  const goal = s.goals.find((g) => g.id === goalId);
  if (!goal?.smart || !smartOpen(goal)) throw new Error('lock-closed');
  if (!keypair) throw new Error('locked');
  const funds = computeFunds(s);
  if (quote.totalToken > funds.free[token] + 1e-9) throw new Error('lock-insufficient-token');
  // the deposit and fee, plus the usual reserve so the claim later can pay its fee
  if (quote.totalSol + SOL_FEE_RESERVE > funds.free.SOL + 1e-9) throw new Error('lock-insufficient-sol');
  const raw = toBaseUnits(String(amount), TOKENS[token].decimals);
  if (raw < 2n) throw new Error('lock-too-small');

  onStage?.('preparing');
  const J = await jupiter();
  const res = await J.createLock({
    endpoints: endpoints(),
    network,
    keypair,
    token,
    raw,
    unlockAt: goal.smart.unlockAt,
  });
  const before = goalProgress(goal, s.prices, network);
  const record = {
    id: res.id,
    provider: 'jupiter',
    base: res.base,
    token,
    amount: Number(amount),
    feeToken: 0,
    feeSol: quote.totalSol,
    depositSol: quote.rentSol,
    unlockAt: goal.smart.unlockAt,
    createdAt: Date.now(),
    signature: res.signature,
    status: 'pending',
  };
  // Saved before confirmation so the lock is never lost if the popup closes.
  await updateGoalLocks(goalId, network, (locks) => [...locks, record]);
  onStage?.('confirming', res.signature);
  try {
    await confirmSignature(endpoints(), res.signature, res);
  } catch (e) {
    if (e.code === 'expired' || e.code === 'tx-failed') {
      await updateGoalLocks(goalId, network, (locks) => locks.filter((l) => l.id !== res.id));
    }
    e.signature = res.signature;
    throw e;
  }
  const updated = await updateGoalLocks(goalId, network, (locks) =>
    locks.map((l) => (l.id === res.id ? { ...l, status: 'locked' } : l)),
  );
  await logActivity({
    type: 'lock',
    goalId,
    goalName: goal.name,
    emoji: goal.emoji,
    token,
    amount: Number(amount),
    signature: res.signature,
    lockId: res.id,
  });
  const after = goalProgress(updated, getState().prices, network);
  const completedNow = before < 1 && after >= 1 && !goal.celebrated?.[network];
  const milestone = completedNow ? null : milestoneCrossed(before, after);
  if (completedNow) {
    const goals = getState().goals.map((g) =>
      g.id === goalId ? { ...g, celebrated: { ...(g.celebrated || {}), [network]: Date.now() } } : g,
    );
    await saveGoals(goals);
    await logActivity({ type: 'goal-completed', goalId, goalName: goal.name, emoji: goal.emoji });
  }
  setState((st) => ({ dropKey: st.dropKey + 1, celebrate: completedNow ? st.celebrate + 1 : st.celebrate }));
  markHistoryStale();
  refresh({ silent: true });
  return { signature: res.signature, completedNow, milestone };
}

/** After the unlock date: brings the tokens back to the wallet and keeps them in the goal. */
export async function withdrawGoalLock({ goalId, lockId, onStage }) {
  const network = net();
  const goal = getState().goals.find((g) => g.id === goalId);
  const lock = goal?.locks?.[network]?.find((l) => l.id === lockId);
  if (!lock) throw new Error('lock-missing');
  if (Date.now() / 1000 < lock.unlockAt) throw new Error('still-locked');
  if (!keypair) throw new Error('locked');
  onStage?.('preparing');
  const jup = providerOf(lock) === 'jupiter';
  await expectIncoming(network, lock.token, lock.amount);
  // storage deposits coming back: Jupiter's escrow (after close) or Streamflow's accounts
  await expectIncoming(network, 'SOL', jup ? (lock.depositSol || 0.005) + 0.0005 : 0.012);
  let res;
  if (jup) {
    const J = await jupiter();
    res = await J.claimLock({ endpoints: endpoints(), network, keypair, id: lock.id, token: lock.token });
  } else {
    const L = await streamflow();
    res = await L.withdrawLock({ endpoints: endpoints(), network, keypair, id: lock.id });
  }
  await updateGoalLocks(goalId, network, (locks) =>
    locks.map((l) => (l.id === lockId ? { ...l, status: 'withdrawing', withdrawSig: res.signature } : l)),
  );
  onStage?.('confirming', res.signature);
  try {
    await confirmSignature(endpoints(), res.signature, res);
  } catch (e) {
    if (e.code === 'expired' || e.code === 'tx-failed') {
      await updateGoalLocks(goalId, network, (locks) =>
        locks.map((l) => (l.id === lockId ? { ...l, status: 'locked', withdrawSig: null } : l)),
      );
    }
    e.signature = res.signature;
    throw e;
  }
  await finishWithdrawal(goalId, lockId, network, res.signature);
  if (jup) reclaimDeposit(goalId, lockId, network); // in the background: the money is already back
  refresh({ silent: true });
  return res.signature;
}

const reclaimTried = new Set();
/**
 * Closes an emptied Jupiter escrow so its storage deposit (~0.005 SOL) returns
 * to the wallet. Best effort: if it fails the tokens are already back, and
 * the next sync tries again once.
 */
async function reclaimDeposit(goalId, lockId, network) {
  const key = `${network}:${lockId}`;
  if (reclaimTried.has(key) || !keypair) return;
  reclaimTried.add(key);
  const goal = getState().goals.find((g) => g.id === goalId);
  const lock = goal?.locks?.[network]?.find((l) => l.id === lockId);
  if (!lock || lock.depositBack || network !== net()) return;
  const markBack = () =>
    updateGoalLocks(goalId, network, (ls) => ls.map((l) => (l.id === lockId ? { ...l, depositBack: true } : l)));
  try {
    const J = await jupiter();
    const st = await J.fetchLock({ endpoints: endpoints(), id: lock.id, decimals: TOKENS[lock.token].decimals });
    if (!st) return await markBack();
    if (st.remaining > 0) return;
    const res = await J.closeLock({ endpoints: endpoints(), network, keypair, id: lock.id, token: lock.token });
    await confirmSignature(endpoints(), res.signature, { ...res, timeoutMs: 60_000 });
    await markBack();
    await logActivity({
      type: 'deposit-back',
      goalId,
      goalName: goal.name,
      emoji: goal.emoji,
      token: 'SOL',
      amount: lock.depositSol ?? null,
      signature: res.signature,
      lockId,
      network,
    });
    markHistoryStale();
    refresh({ silent: true });
  } catch {
    // stays open; the deposit can be reclaimed on a later sync
  }
}

async function finishWithdrawal(goalId, lockId, network, signature) {
  const goal = getState().goals.find((g) => g.id === goalId);
  const lock = goal?.locks?.[network]?.find((l) => l.id === lockId);
  if (!goal || !lock || lock.status === 'withdrawn') return;
  const goals = getState().goals.map((g) => {
    if (g.id !== goalId) return g;
    const a = goalAlloc(g, network);
    a[lock.token] = +(a[lock.token] + lock.amount).toFixed(TOKENS[lock.token].decimals);
    const locks = (g.locks?.[network] || []).map((l) =>
      l.id === lockId ? { ...l, status: 'withdrawn', withdrawnAt: Date.now(), withdrawSig: signature || l.withdrawSig } : l,
    );
    return { ...g, allocations: { ...(g.allocations || {}), [network]: a }, locks: { ...(g.locks || {}), [network]: locks } };
  });
  await saveGoals(goals);
  await logActivity({
    type: 'unlock',
    goalId,
    goalName: goal.name,
    emoji: goal.emoji,
    token: lock.token,
    amount: lock.amount,
    signature: signature || lock.withdrawSig,
    lockId,
  });
  markHistoryStale();
}

async function fetchLockState(lock, network) {
  const decimals = TOKENS[lock.token].decimals;
  if (providerOf(lock) === 'jupiter') {
    const J = await jupiter();
    return J.fetchLock({ endpoints: endpoints(), id: lock.id, decimals });
  }
  const L = await streamflow();
  return L.fetchLock({ endpoints: endpoints(), network, id: lock.id, decimals });
}

/**
 * Re-reads every open lock of a goal from the chain: confirms pending ones,
 * drops ones that never landed, notices withdrawals made elsewhere.
 */
export async function syncGoalLocks(goalId) {
  const network = net();
  const goal = getState().goals.find((g) => g.id === goalId);
  const all = goal?.locks?.[network] || [];
  const open = all.filter((l) => l.status !== 'withdrawn');
  for (const lock of open) {
    let st;
    try {
      st = await fetchLockState(lock, network);
    } catch {
      continue; // network trouble, try next time
    }
    const nowSec = Date.now() / 1000;
    if (!st) {
      if (lock.status === 'pending' && Date.now() - lock.createdAt > 3 * 60_000) {
        const sig = await getSignatureStatus(endpoints(), lock.signature).catch(() => undefined);
        if (sig === null || sig?.err)
          await updateGoalLocks(goalId, network, (ls) => ls.filter((l) => !(l.id === lock.id && l.status === 'pending')));
      } else if ((lock.status === 'locked' || lock.status === 'withdrawing') && nowSec >= lock.unlockAt) {
        await finishWithdrawal(goalId, lock.id, network, lock.withdrawSig); // account closed after full withdrawal
      }
      continue;
    }
    if (st.remaining <= 1e-9 || st.closed) {
      if (nowSec >= lock.unlockAt) await finishWithdrawal(goalId, lock.id, network, lock.withdrawSig);
      continue;
    }
    if (lock.status === 'pending' || Math.abs(st.remaining - lock.amount) > 1e-6) {
      // re-read: a withdrawal may have started while we were waiting for the node
      await updateGoalLocks(goalId, network, (ls) =>
        ls.map((l) =>
          l.id === lock.id && (l.status === 'pending' || l.status === 'locked') ? { ...l, status: 'locked', amount: st.remaining } : l,
        ),
      );
    }
  }
  const refunds = (getState().goals.find((g) => g.id === goalId)?.locks?.[network] || []).filter(
    (l) => l.provider === 'jupiter' && l.status === 'withdrawn' && !l.depositBack,
  );
  for (const l of refunds) await reclaimDeposit(goalId, l.id, network);
}

// ---- history -----------------------------------------------------------

/** The list on screen stays; the next visit to History refreshes it quietly. */
export function markHistoryStale() {
  const h = getState().history;
  if (h) setState({ history: { ...h, stale: true } });
}

let historyLoad = null;
/**
 * Fetches the wallet's recent transactions. The last list (also kept in
 * storage between popups) is shown right away and replaced when the new one
 * arrives, so the screen never goes back to placeholders.
 */
export function loadHistory() {
  if (historyLoad) return historyLoad;
  historyLoad = (async () => {
    const s = getState();
    if (!s.wallet) return;
    const network = s.settings.network;
    const owner = s.wallet.publicKey;
    if (s.history?.network !== network) {
      const cached = (await getOne(local, 'historyCache'))?.[network];
      if (cached?.owner === owner && Array.isArray(cached.entries) && getState().settings.network === network) {
        setState({ history: { network, entries: cached.entries, stale: true } });
      }
    }
    setState({ historyStatus: 'loading' });
    try {
      const entries = await fetchHistory(endpoints(), owner, network, getState().balances);
      if (getState().settings.network !== network) return;
      setState({ history: { network, entries }, historyStatus: 'ok' });
      const cache = (await getOne(local, 'historyCache')) || {};
      await local.set({ historyCache: { ...cache, [network]: { owner, entries, ts: Date.now() } } });
    } catch {
      setState({ historyStatus: 'error' });
    }
  })().finally(() => {
    historyLoad = null;
  });
  return historyLoad;
}

// ---- settings ----------------------------------------------------------

export async function updateSettings(patch) {
  const prev = getState().settings;
  const settings = { ...prev, ...patch };
  if (patch.language) setLang(detectLang(patch.language));
  if (patch.theme) applyTheme(patch.theme, { animate: true });
  setState({ settings });
  await local.set({ settings });
  if (isExtension) chrome.runtime.sendMessage({ type: 'settings-changed', settings }).catch(() => {});
  if (patch.network && patch.network !== prev.network) {
    setState({ balances: null, history: null, balancesStatus: 'loading' });
    refresh();
  }
  if (patch.customRpc) {
    markHistoryStale();
    refresh();
  }
}
