// Look-alike ("poisoned") recipients and spam-only senders.
import assert from 'node:assert/strict';
import { looksAlike, recipientRisk, addrParts } from '../src/lib/poison.js';

const OWNER = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const FRIEND = '5NtAxeQ8uCq1nKxH2WmLbJpZr7vYsTdE3gFoRiUcV9aB';
const FAKE = '5NtAxzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzV9aB'; // same start and end as FRIEND
const FAKE_OWN = 'HAgkXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDKpqk'; // looks like our own address
const EXCHANGE = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const FAKE_EX = '9WzDqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAWWM';
const STRANGER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const SPAMMER = 'Fh3vGQ1Hq3k1bqvZb3xY6tCw2gUeFq2mEoXcZsDp4LTr';

assert.ok(looksAlike(FRIEND, FAKE));
assert.ok(!looksAlike(FRIEND, FRIEND));
assert.ok(!looksAlike(FRIEND, STRANGER));
assert.deepEqual(addrParts(FRIEND), ['5NtA', FRIEND.slice(4, -4), 'V9aB']);

const activity = [{ type: 'send', token: 'USDC', amount: '10', to: FRIEND }];
const entries = [
  { counterparty: EXCHANGE, changes: [{ token: 'USDC', delta: 250 }] }, // real money in
  { counterparty: FAKE, changes: [{ token: 'USDC', delta: 0.0001 }] }, // the poisoning dust
  { counterparty: SPAMMER, changes: [{ token: 'SOL', delta: 0.000001 }] },
  { counterparty: SPAMMER, changes: [{ token: 'USDT', delta: 0.01 }] },
  { counterparty: FAKE_EX, changes: [{ token: 'SOL', delta: 0.00001 }], err: true }, // failed: ignored
];
const ctx = { owner: OWNER, activity, entries };

// the real addresses are fine
assert.deepEqual(recipientRisk(FRIEND, ctx), {});
assert.deepEqual(recipientRisk(EXCHANGE, ctx), {});
assert.deepEqual(recipientRisk(STRANGER, ctx), {}); // new, unknown and unlike anything: no alarm

// look-alikes of someone you paid, someone who paid you and yourself
assert.deepEqual(recipientRisk(FAKE, ctx), { twin: FRIEND });
assert.deepEqual(recipientRisk(FAKE_EX, ctx), { twin: EXCHANGE });
assert.deepEqual(recipientRisk(FAKE_OWN, ctx), { twin: OWNER });

// an address that has only ever sent dust
assert.deepEqual(recipientRisk(SPAMMER, ctx), { dustOnly: true });

// once it has sent real money too, it's a normal sender
const paid = { ...ctx, entries: [...entries, { counterparty: SPAMMER, changes: [{ token: 'USDC', delta: 40 }] }] };
assert.deepEqual(recipientRisk(SPAMMER, paid), {});

// someone you paid on-chain (not through this piggy bank) also counts as known
const viaHistory = { owner: OWNER, activity: [], entries: [{ counterparty: FRIEND, changes: [{ token: 'USDC', delta: -5 }, { token: 'SOL', delta: -0.002 }] }] };
assert.deepEqual(recipientRisk(FAKE, viaHistory), { twin: FRIEND });

// nothing known yet: nothing to compare with
assert.deepEqual(recipientRisk(FAKE, { owner: OWNER }), {});

console.log('Poisoning: look-alikes and spam-only senders are flagged');
