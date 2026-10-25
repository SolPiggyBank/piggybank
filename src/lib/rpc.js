// Minimal JSON-RPC client with endpoint fallback. No web3.js here so the
// background worker stays tiny.
import { TOKENS, TOKEN_ORDER, NETWORKS } from './config.js';

const preferred = new Map(); // endpoint list key -> index of the last endpoint that worked
// how each node answered its last check: url -> { ok, ms, ts }
const health = new Map();
const DEFAULT_NODES = new Set([...NETWORKS.mainnet.rpc, ...NETWORKS.devnet.rpc]);

/** Seeds what is known about the nodes (from storage, at start). */
export function setRpcHealth(entries) {
  for (const [url, h] of Object.entries(entries || {})) health.set(url, h);
}
export function rpcHealth() {
  return Object.fromEntries(health);
}

/**
 * The order to try nodes in: the one that worked last in this session, then
 * the person's own node, then the others from fastest to slowest by their last
 * check; nodes that didn't answer go last.
 */
function tryOrder(endpoints, key) {
  const score = (url) => {
    const h = health.get(url);
    if (!DEFAULT_NODES.has(url)) return h && !h.ok ? 2e6 : -1; // your own node leads while it works
    if (!h) return 1e6;
    return h.ok ? h.ms : 3e6;
  };
  const idx = endpoints.map((_, i) => i).sort((a, b) => score(endpoints[a]) - score(endpoints[b]) || a - b);
  const p = preferred.get(key);
  return p == null ? idx : [p, ...idx.filter((i) => i !== p)];
}
let reqId = 1;

export class RpcError extends Error {
  constructor(message, code, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

async function callOne(url, method, params, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: reqId++, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new RpcError(`HTTP ${res.status}`, 'http', res.status);
    const json = await res.json();
    if (json.error) throw new RpcError(json.error.message || 'RPC error', json.error.code, json.error.data);
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rateLimited = (e) => e instanceof RpcError && (e.data === 429 || e.code === 429 || e.code === -32005);
// public nodes allow ~100 requests per 10 s per person: when every node says
// "too many", wait a moment and try once more instead of failing straight away
const BUSY_PAUSES = [700, 1800];

/**
 * Calls `method` on the first endpoint that answers, starting with the one
 * that worked last. Errors returned by the node itself (bad params, a failed
 * simulation) are not retried elsewhere.
 */
export async function rpc(endpoints, method, params = [], { timeoutMs = 12000 } = {}) {
  const key = endpoints.join('|');
  let lastErr;
  for (let round = 0; round <= BUSY_PAUSES.length; round++) {
    let allBusy = true;
    for (const idx of tryOrder(endpoints, key)) {
      try {
        const result = await callOne(endpoints[idx], method, params, timeoutMs);
        preferred.set(key, idx);
        return result;
      } catch (e) {
        lastErr = e;
        const nodeError = e instanceof RpcError && e.code !== 'http' && e.code !== -32005 && e.code !== 429;
        if (nodeError) throw e;
        if (!rateLimited(e)) allBusy = false;
      }
    }
    if (!allBusy || round === BUSY_PAUSES.length) break;
    await sleep(BUSY_PAUSES[round]);
  }
  throw lastErr || new RpcError('network unavailable', 'network');
}

/** The nodes from best to worst by their last check (your own node first while it works). */
export function rankEndpoints(endpoints) {
  return tryOrder(endpoints, null).map((i) => endpoints[i]);
}

/** The endpoint calls go to first right now. */
export function activeEndpoint(endpoints) {
  const key = endpoints.join('|');
  return endpoints[tryOrder(endpoints, key)[0]];
}

/** One node's health: answers, which network, how fast. */
export async function pingNode(url, timeoutMs = 6000) {
  const t0 = Date.now();
  try {
    const genesis = await callOne(url, 'getGenesisHash', [], timeoutMs);
    return { ok: true, genesis, ms: Math.max(1, Date.now() - t0) };
  } catch (e) {
    return { ok: false, busy: rateLimited(e), error: e?.message || 'error' };
  }
}

/**
 * Checks every node at once and remembers the result, so the next calls go to
 * the fastest one that answers. `genesis` is the network's genesis hash: a node
 * on another network counts as not answering. onEach(url, result) reports progress.
 */
export async function checkNodes(endpoints, genesis, onEach) {
  const out = {};
  await Promise.all(
    endpoints.map(async (url) => {
      let r = await pingNode(url, 5000);
      if (r.ok && genesis && r.genesis !== genesis) r = { ok: false, wrong: true };
      health.set(url, { ok: r.ok, ms: r.ms || 0, ts: Date.now() });
      out[url] = r;
      onEach?.(url, r);
    }),
  );
  // start over from the best node, not the one that happened to work last
  preferred.delete(endpoints.join('|'));
  return out;
}

/** Balances of SOL and the supported stablecoins for one owner. */
export async function fetchBalances(endpoints, owner, network) {
  const out = { SOL: 0, USDC: 0, USDT: 0, accounts: {} };
  const tasks = [
    rpc(endpoints, 'getBalance', [owner, { commitment: 'confirmed' }]).then((r) => {
      out.SOL = (r?.value ?? 0) / 1e9;
    }),
  ];
  for (const sym of TOKEN_ORDER) {
    const mint = TOKENS[sym].mint[network];
    if (!mint) continue;
    tasks.push(
      rpc(endpoints, 'getTokenAccountsByOwner', [
        owner,
        { mint },
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]).then((r) => {
        let total = 0;
        const accounts = [];
        for (const acc of r?.value || []) {
          const info = acc.account?.data?.parsed?.info;
          const amount = Number(info?.tokenAmount?.uiAmountString ?? info?.tokenAmount?.uiAmount ?? 0);
          total += amount;
          accounts.push({ pubkey: acc.pubkey, amount, raw: info?.tokenAmount?.amount ?? '0' });
        }
        accounts.sort((a, b) => b.amount - a.amount);
        out[sym] = total;
        out.accounts[sym] = accounts;
      }),
    );
  }
  await Promise.all(tasks);
  return out;
}
