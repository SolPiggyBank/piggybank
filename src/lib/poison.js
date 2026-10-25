// Address poisoning: a scammer makes an address that starts and ends like one you
// already use, sends you a tiny amount from it, and waits for you to copy it from
// your history next time. Wallets usually show addresses shortened (ABCD…WXYZ),
// which is exactly the part the fake gets right.
import { worthAnnouncing } from './deposits.js';

const EDGE = 4;

export const looksAlike = (a, b) =>
  !!a && !!b && a !== b && a.slice(0, EDGE) === b.slice(0, EDGE) && a.slice(-EDGE) === b.slice(-EDGE);

/**
 * What the wallet's own past says about sending to `to`:
 *   { twin }      it looks like (but isn't) your address, one you paid, or one that sent you real money
 *   { dustOnly }  it has only ever sent you spam-sized amounts
 *   {}            nothing suspicious
 * `activity` is the piggy bank's own log, `entries` the on-chain history (any order).
 */
export function recipientRisk(to, { owner, activity = [], entries = [] }) {
  const known = new Set(owner ? [owner] : []);
  for (const a of activity) if (a?.type === 'send' && a.to) known.add(a.to);
  let fromTo = 0;
  let dustFromTo = 0;
  for (const e of entries) {
    if (!e?.counterparty || e.err) continue;
    const ch = e.changes || [];
    const outgoing = ch.length > 0 && ch.every((c) => c.delta < 0);
    const realIncoming = ch.some((c) => c.delta > 0 && worthAnnouncing(c.token, c.delta));
    if (outgoing || realIncoming) known.add(e.counterparty);
    if (e.counterparty === to) {
      fromTo++;
      if (ch.length && ch.every((c) => c.delta > 0 && !worthAnnouncing(c.token, c.delta))) dustFromTo++;
    }
  }
  if (known.has(to)) return {};
  const twin = [...known].find((a) => looksAlike(a, to));
  if (twin) return { twin };
  if (fromTo > 0 && dustFromTo === fromTo) return { dustOnly: true };
  return {};
}

/** The address split for display: the matching start and end, and the middle that differs. */
export const addrParts = (a) => [a.slice(0, EDGE), a.slice(EDGE, -EDGE), a.slice(-EDGE)];
