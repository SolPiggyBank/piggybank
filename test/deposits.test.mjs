// Incoming money: what gets announced and what is quietly absorbed as spam dust.
import assert from 'node:assert/strict';

const mem = new Map();
const area = {
  async get(keys) {
    const out = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) if (mem.has(k)) out[k] = structuredClone(mem.get(k));
    return out;
  },
  async set(obj) {
    for (const [k, v] of Object.entries(obj)) mem.set(k, structuredClone(v));
  },
  async remove(keys) {
    for (const k of Array.isArray(keys) ? keys : [keys]) mem.delete(k);
  },
};
globalThis.chrome = { storage: { local: area, session: area } };

const { reconcileBalances, worthAnnouncing, ANNOUNCE_MIN, expectIncoming } = await import('../src/lib/deposits.js');

assert.deepEqual(ANNOUNCE_MIN, { SOL: 0.01, USDC: 1, USDT: 1 });
assert.ok(!worthAnnouncing('USDT', 0.999999));
assert.ok(worthAnnouncing('USDT', 1));
assert.ok(!worthAnnouncing('USDC', 0.5));
assert.ok(worthAnnouncing('USDC', 1));
assert.ok(!worthAnnouncing('SOL', 0.009));
assert.ok(worthAnnouncing('SOL', 0.01));

const owner = 'Owner1111111111111111111111111111111111111';
const bal = (SOL, USDC, USDT) => ({ SOL, USDC, USDT });
let b = bal(1, 100, 50);

// the first look only remembers the balances
assert.deepEqual(await reconcileBalances('mainnet', owner, b), []);

// dust in every coin: nothing announced, nothing in the inbox, but the balance is remembered
b = bal(1.000001, 100.0001, 50.5);
assert.deepEqual(await reconcileBalances('mainnet', owner, b), []);
assert.equal(mem.get('depositInbox'), undefined);
assert.deepEqual(mem.get('knownBalances')[`mainnet:${owner}`], b);

// a real deposit right after the dust is announced at its own size, not dust + deposit
b = bal(1.000001, 125.0001, 50.5);
let ev = await reconcileBalances('mainnet', owner, b);
assert.equal(ev.length, 1);
assert.equal(ev[0].token, 'USDC');
assert.ok(Math.abs(ev[0].amount - 25) < 1e-9, ev[0].amount);

// exactly at the thresholds is announced
b = bal(1.010001, 126.0001, 51.5);
ev = await reconcileBalances('mainnet', owner, b);
assert.deepEqual(ev.map((e) => e.token).sort(), ['SOL', 'USDC', 'USDT']);
assert.equal(mem.get('depositInbox').length, 4);

// money the piggy bank brings back itself is still not announced
await expectIncoming('mainnet', 'USDC', 40);
b = bal(1.010001, 166.0001, 51.5);
assert.deepEqual(await reconcileBalances('mainnet', owner, b), []);

// 0.5 USDT of dust on top of an expected return: still quiet
await expectIncoming('mainnet', 'USDT', 10);
b = bal(1.010001, 166.0001, 62);
assert.deepEqual(await reconcileBalances('mainnet', owner, b), []);

console.log('Deposits: dust stays quiet, real money is announced');
