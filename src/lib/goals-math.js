// Pure helpers for goal progress; shared by popup and background.
// Allocations are kept per network: goal.allocations = { mainnet: {USDC, USDT, SOL}, devnet: {...} }.

export function goalAlloc(goal, net) {
  return { SOL: 0, USDC: 0, USDT: 0, ...(goal.allocations?.[net] || {}) };
}

/** Locks are kept per network: goal.locks = { mainnet: [{ id, token, amount, status, unlockAt, ... }] }. */
export function goalLocks(goal, net) {
  return goal.locks?.[net] || [];
}

/** Tokens currently held in the smart contract for this goal (locked or awaiting confirmation). */
export function goalLocked(goal, net) {
  const out = { SOL: 0, USDC: 0, USDT: 0 };
  for (const l of goalLocks(goal, net)) {
    if (l.status === 'locked' || l.status === 'pending') out[l.token] += l.amount;
  }
  return out;
}

export function hasActiveLocks(goal, net) {
  return goalLocks(goal, net).some((l) => l.status === 'locked' || l.status === 'pending');
}

function usdOf(a, prices) {
  return a.USDC * (prices?.USDC ?? 1) + a.USDT * (prices?.USDT ?? 1) + a.SOL * (prices?.SOL ?? 0);
}

export function goalSavedUsd(goal, prices, net) {
  return usdOf(goalAlloc(goal, net), prices) + usdOf(goalLocked(goal, net), prices);
}

export function lockedByToken(goals, net) {
  const out = { SOL: 0, USDC: 0, USDT: 0 };
  for (const g of goals || []) {
    const l = goalLocked(g, net);
    for (const k of Object.keys(out)) out[k] += l[k];
  }
  return out;
}

/** Smart-lock goals accept new locks only until their unlock date. */
export function smartOpen(goal) {
  return !!goal.smart && goal.smart.unlockAt * 1000 > Date.now() + 60_000;
}

export function goalProgress(goal, prices, net) {
  if (!goal.target) return 0;
  return Math.min(1, goalSavedUsd(goal, prices, net) / goal.target);
}

export function allocatedByToken(goals, net) {
  const out = { SOL: 0, USDC: 0, USDT: 0 };
  for (const g of goals || []) {
    const a = goalAlloc(g, net);
    for (const k of Object.keys(out)) out[k] += a[k];
  }
  return out;
}

/** How much to put aside per week to hit the target by the deadline. */
export function weeklyPace(goal, prices, net) {
  if (!goal.deadline) return null;
  const left = goal.target - goalSavedUsd(goal, prices, net);
  if (left <= 0) return 0;
  const days = Math.max(1, Math.ceil((new Date(goal.deadline + 'T23:59:59') - Date.now()) / 86400000));
  return left / Math.max(1, days / 7);
}

/** A month or closer: the plan is easier to follow as an amount per day. */
export const DAILY_PACE_DAYS = 31;

/**
 * How much to put aside to reach the target by the deadline.
 * { amount, per: 'day' | 'week', days } — per day when the deadline is a month
 * away or closer, per week otherwise; null without a deadline, once the
 * deadline has passed, or when the goal is already reached.
 */
export function savingPace(goal, prices, net) {
  if (!goal.deadline) return null;
  const left = goal.target - goalSavedUsd(goal, prices, net);
  if (left <= 0) return null;
  const ms = new Date(goal.deadline + 'T23:59:59') - Date.now();
  if (ms < 0) return null;
  const days = Math.max(1, Math.ceil(ms / 86400000));
  if (days <= DAILY_PACE_DAYS) return { amount: left / days, per: 'day', days };
  return { amount: left / (days / 7), per: 'week', days };
}

/** The highest of 25 / 50 / 75 % that a top-up just passed (100 % is its own celebration). */
export function milestoneCrossed(before, after) {
  for (const m of [0.75, 0.5, 0.25]) if (before < m && after >= m && after < 1) return Math.round(m * 100);
  return null;
}

/** True while the goal holds any money on this network, in the wallet or in a contract. */
export function goalHoldsMoney(goal, net) {
  const a = goalAlloc(goal, net);
  const l = goalLocked(goal, net);
  return ['SOL', 'USDC', 'USDT'].some((t) => a[t] > 0 || l[t] > 0);
}

/**
 * "Lock until reached": the goal's money stays put until the goal is reached once.
 * From then on the lock is off on that network for good, even if the SOL price dips
 * or part of the money is taken out. It comes back only for a new round: when the
 * goal has been emptied, or its target raised (see withReached and saveGoal).
 */
export function isProtected(goal, prices, net) {
  if (!goal?.locked || goal.smart) return false;
  if (goal.reachedAt?.[net]) return false;
  return goalProgress(goal, prices, net) < 1;
}

/** goal.reachedAt kept in step with the money: set when a locked goal fills up, cleared once it is empty. */
export function withReached(goal, prices, net, now = Date.now()) {
  const reached = goal.reachedAt?.[net];
  const holds = goalHoldsMoney(goal, net);
  if (reached && !holds) return { ...goal, reachedAt: { ...goal.reachedAt, [net]: null } };
  if (!reached && holds && goal.locked && !goal.smart && goalProgress(goal, prices, net) >= 1) {
    return { ...goal, reachedAt: { ...(goal.reachedAt || {}), [net]: now } };
  }
  return goal;
}
