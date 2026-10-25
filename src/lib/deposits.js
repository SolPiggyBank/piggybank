// Detects incoming funds by comparing fresh balances with the last ones we saw.
// Used by both the popup and the background worker, so a deposit is reported once.
import { local, getOne } from './storage.js';

const EPS = { SOL: 0.0000005, USDC: 0.000001, USDT: 0.000001 };

/**
 * Smaller incoming amounts are mostly spam ("dust" sent from look-alike addresses
 * so the victim later copies the wrong one), so they don't get a notification or a
 * "money arrived" card. The balance still counts them; they're simply not announced.
 */
export const ANNOUNCE_MIN = { SOL: 0.01, USDC: 1, USDT: 1 };
// (the 1e-9 only absorbs float noise in the balance difference, far below one base unit)
export const worthAnnouncing = (token, amount) => amount >= (ANNOUNCE_MIN[token] ?? 0) - 1e-9;

/**
 * expectedIncoming: money the piggy bank itself brings back (e.g. withdrawing an
 * unlocked smart-contract lock). It shouldn't be announced as a new deposit.
 */
export async function expectIncoming(network, token, amount) {
  const list = (await getOne(local, 'expectedIncoming', [])).filter((e) => e.until > Date.now());
  list.push({ network, token, amount, until: Date.now() + 10 * 60_000 });
  await local.set({ expectedIncoming: list });
}

/**
 * The popup and the background worker both call this; the Web Lock (shared by
 * every page of the extension) keeps them from announcing one deposit twice.
 */
export function reconcileBalances(network, owner, balances) {
  const run = () => reconcileUnlocked(network, owner, balances);
  return globalThis.navigator?.locks ? navigator.locks.request('piggy-reconcile', run) : run();
}

async function reconcileUnlocked(network, owner, balances) {
  const key = `${network}:${owner}`;
  const known = await getOne(local, 'knownBalances', {});
  let expected = (await getOne(local, 'expectedIncoming', [])).filter((e) => e.until > Date.now());
  const prev = known[key];
  const current = { SOL: balances.SOL, USDC: balances.USDC, USDT: balances.USDT };
  const events = [];
  if (prev) {
    for (const t of ['SOL', 'USDC', 'USDT']) {
      let diff = (current[t] || 0) - (prev[t] || 0);
      if (diff > EPS[t]) {
        for (const e of expected) {
          if (e.network !== network || e.token !== t || e.amount <= 0) continue;
          const used = Math.min(diff, e.amount);
          diff -= used;
          e.amount -= used;
        }
      }
      if (diff > EPS[t] && worthAnnouncing(t, diff)) {
        events.push({ id: `${Date.now()}-${t}`, token: t, amount: diff, ts: Date.now(), network });
      }
    }
  }
  known[key] = current;
  expected = expected.filter((e) => e.amount > EPS[e.token]);
  const update = { knownBalances: known, expectedIncoming: expected };
  if (events.length) {
    const inbox = await getOne(local, 'depositInbox', []);
    update.depositInbox = [...events, ...inbox].slice(0, 10);
  }
  await local.set(update);
  return events;
}
