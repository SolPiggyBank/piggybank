// Node choice: the fastest node that answered goes first, dead ones last,
// your own node leads while it works, and "too many requests" everywhere is
// waited out once before giving up.
import assert from 'node:assert/strict';
import { rpc, setRpcHealth, checkNodes, rankEndpoints, activeEndpoint } from '../src/lib/rpc.js';
import { NETWORKS, GENESIS } from '../src/lib/config.js';

const [A, B, C] = NETWORKS.mainnet.rpc;
const OWN = 'https://my-node.example.com';
let calls = [];
let behaviour = {}; // url -> 'ok' | 'down' | 'busy' | 'slow'
globalThis.fetch = async (url, opts) => {
  calls.push(url);
  const body = JSON.parse(opts.body);
  const mode = behaviour[url] || 'ok';
  if (mode === 'down') throw new TypeError('Failed to fetch');
  if (mode === 'busy') return new Response('slow down', { status: 429 });
  if (mode === 'slow') await new Promise((r) => setTimeout(r, 40));
  const result = body.method === 'getGenesisHash' ? GENESIS.mainnet : { value: 42 };
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200 });
};

// 1. ranking by the last check
{
  setRpcHealth({ [A]: { ok: false, ms: 0, ts: Date.now() }, [B]: { ok: true, ms: 300, ts: Date.now() }, [C]: { ok: true, ms: 40, ts: Date.now() } });
  const list = [A, B, C];
  assert.deepEqual(rankEndpoints(list), [C, B, A]);
  calls = [];
  await rpc(list, 'getBalance', ['x']);
  assert.equal(calls[0], C, 'fastest healthy node first');
  // C fails: B next, never the dead A first
  behaviour = { [C]: 'down' };
  calls = [];
  await rpc(list, 'getSlot');
  assert.deepEqual(calls.slice(0, 2), [C, B]);
  assert.equal(activeEndpoint(list), B, 'sticks with the node that worked');
  console.log('ok - fastest answering node first, dead ones last, sticks with what works');
}

// 2. your own node leads while it works
{
  behaviour = {};
  const list = [OWN, A, B, C];
  assert.equal(rankEndpoints(list)[0], OWN);
  setRpcHealth({ [OWN]: { ok: false, ms: 0, ts: Date.now() } });
  const ranked = rankEndpoints(list);
  assert.ok(ranked.indexOf(OWN) > ranked.indexOf(B) && ranked.indexOf(OWN) > ranked.indexOf(C), 'a dead own node waits behind working ones');
  console.log('ok - your own node first while it answers');
}

// 3. a fresh check re-ranks everything
{
  behaviour = { [A]: 'ok', [B]: 'slow', [C]: 'down' };
  const res = await checkNodes([A, B, C], GENESIS.mainnet);
  assert.ok(res[A].ok && res[B].ok && !res[C].ok);
  assert.deepEqual(rankEndpoints([A, B, C]), [A, B, C]);
  calls = [];
  await rpc([A, B, C], 'getSlot');
  assert.equal(calls[0], A);
  console.log('ok - checking the nodes re-ranks them');
}

// 4. every node rate-limited: a short pause, then it goes through
{
  let n = 0;
  behaviour = { [A]: 'busy', [B]: 'busy', [C]: 'busy' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (++n > 3) behaviour = {}; // the limit clears after the first round
    return realFetch(url, opts);
  };
  const t0 = Date.now();
  const r = await rpc([A, B, C], 'getBalance', ['x']);
  assert.equal(r.value, 42);
  assert.ok(Date.now() - t0 >= 600, 'waited before retrying');
  globalThis.fetch = realFetch;
  console.log('ok - "too many requests" everywhere is waited out');
}

console.log('rpc: 4 tests passed');
