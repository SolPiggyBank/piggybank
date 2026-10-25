// On-chain time locks through Streamflow (audited token lock protocol).
// Loaded lazily: the SDK is large and only needed when a goal uses a smart lock.
//
// A lock here is a Streamflow contract where sender = recipient = the user,
// start = cliff = unlock time and cliffAmount = amount, with cancel/transfer/top-up
// disabled. Nobody — not the user, not this extension, not Streamflow — can move
// the tokens before the unlock time; after it, only the recipient can withdraw.

import { SolanaStreamClient, ICluster } from '@streamflow/stream';
import { buildLockParams } from '@streamflow/stream/solana/api';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { TOKENS } from './config.js';
import { rpc } from './rpc.js';
import { toBaseUnits } from './solana.js';

export const LOCK_TOKENS = ['USDC', 'USDT'];
export const STREAMFLOW_PROGRAM = {
  mainnet: 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m',
  devnet: 'HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ',
};

const CU_LIMIT = 300_000;
const CU_PRICE_MICROLAMPORTS = 50_000;
const METADATA_ACC_SIZE = 1104; // Streamflow contract metadata account
const TOKEN_ACC_SIZE = 165; // escrow token account

const clients = new Map();
let connectionFactory = (endpoint) => new Connection(endpoint, 'confirmed');

/** Tests swap the connection for an offline fake. */
export function setConnectionFactory(fn) {
  connectionFactory = fn;
  clients.clear();
}

function client(endpoint, network) {
  const key = `${network}|${endpoint}`;
  if (!clients.has(key)) {
    clients.set(
      key,
      new SolanaStreamClient({
        connection: connectionFactory(endpoint),
        cluster: network === 'devnet' ? ICluster.Devnet : ICluster.Mainnet,
      }),
    );
  }
  return clients.get(key);
}

/** Runs fn(client) against each endpoint until one works. */
async function withClient(endpoints, network, fn) {
  let lastErr;
  for (const ep of endpoints) {
    try {
      return await fn(client(ep, network));
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      // Errors about the request itself won't get better on another node.
      if (!/fetch|network|429|50\d|timeout|ECONN|Failed to/i.test(msg)) throw e;
    }
  }
  throw lastErr;
}

/** Name stored on-chain: at most 64 bytes of UTF-8. */
export function lockName(goalName) {
  const enc = new TextEncoder();
  let name = `Piggy: ${goalName}`;
  while (enc.encode(name).length > 64) name = name.slice(0, -1);
  return name;
}

/**
 * What a lock of `amount` costs, read from Streamflow's on-chain fee oracle.
 * Token fee is charged on top of the locked amount; SOL covers Streamflow's
 * creation fee, account rent and the network fee.
 */
export async function getLockQuote({ endpoints, network, token, amount }) {
  const decimals = TOKENS[token].decimals;
  const fees = await withClient(endpoints, network, (c) => c.getDefaultFees());
  const [rentMeta, rentEscrow] = await Promise.all([
    rpc(endpoints, 'getMinimumBalanceForRentExemption', [METADATA_ACC_SIZE]),
    rpc(endpoints, 'getMinimumBalanceForRentExemption', [TOKEN_ACC_SIZE]),
  ]);
  const feePercent = fees.streamflowLockFee ?? fees.streamflowFee ?? 0;
  const raw = toBaseUnits(amount, decimals);
  // Same formula as the SDK (FEE_NORMALIZER 1e4, FEE_MULTIPLIER 1e6).
  const totalRaw = (raw * BigInt(Math.round(feePercent * 1e4) + 1e6)) / 1_000_000n;
  const tokenFee = Number(totalRaw - raw) / 10 ** decimals;
  const networkFeeLamports = 5000 * 2 + Math.ceil((CU_LIMIT * CU_PRICE_MICROLAMPORTS) / 1e6);
  const solLamports = Number(fees.creationFeeSol || 0) + rentMeta + rentEscrow + networkFeeLamports;
  return {
    feePercent,
    tokenFee,
    totalToken: Number(totalRaw) / 10 ** decimals,
    creationFeeSol: Number(fees.creationFeeSol || 0) / 1e9,
    rentSol: (rentMeta + rentEscrow) / 1e9,
    networkFeeSol: networkFeeLamports / 1e9,
    totalSol: solLamports / 1e9,
  };
}

async function signAndSend(endpoints, ixs, payer, signers) {
  const { value: bh } = await rpc(endpoints, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = new Transaction();
  tx.add(...ixs);
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = payer;
  tx.sign(...signers);
  const raw = tx.serialize().toString('base64');
  const signature = await rpc(endpoints, 'sendTransaction', [
    raw,
    { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 0 },
  ]);
  return { signature, raw, lastValidBlockHeight: bh.lastValidBlockHeight };
}

/** Builds instructions for a lock without sending anything (also used by tests). */
export async function buildLockInstructions({ endpoints, network, owner, token, amount, unlockAt, name }) {
  const meta = TOKENS[token];
  const mint = meta.mint[network];
  if (!mint) throw new Error('token-unavailable');
  const params = buildLockParams({
    recipient: owner.publicKey.toBase58(),
    tokenId: mint,
    amount: new BN(toBaseUnits(amount, meta.decimals).toString()),
    unlockDate: unlockAt,
    name,
    transferableByRecipient: false,
  });
  return withClient(endpoints, network, (c) =>
    c.buildCreateTransactionInstructions(params, {
      sender: owner,
      isNative: false,
      computeLimit: CU_LIMIT,
      computePrice: CU_PRICE_MICROLAMPORTS,
    }),
  );
}

/** Creates the lock. Returns { id, signature, raw, lastValidBlockHeight }. */
export async function createLock({ endpoints, network, keypair, token, amount, unlockAt, name }) {
  const { ixs, metadataId, metadata } = await buildLockInstructions({
    endpoints,
    network,
    owner: keypair,
    token,
    amount,
    unlockAt,
    name,
  });
  const signers = metadata ? [keypair, metadata] : [keypair];
  const sent = await signAndSend(endpoints, ixs, keypair.publicKey, signers);
  return { id: metadataId, ...sent };
}

export async function buildWithdrawInstructions({ endpoints, network, owner, id }) {
  return withClient(endpoints, network, (c) =>
    c.prepareWithdrawInstructions(
      { id },
      { invoker: owner, checkTokenAccounts: true, computeLimit: 200_000, computePrice: CU_PRICE_MICROLAMPORTS },
    ),
  );
}

/** Withdraws everything that has unlocked. */
export async function withdrawLock({ endpoints, network, keypair, id }) {
  const ixs = await buildWithdrawInstructions({ endpoints, network, owner: keypair, id });
  return signAndSend(endpoints, ixs, keypair.publicKey, [keypair]);
}

/** Current on-chain state of a lock, or null if the account doesn't exist (yet). */
export async function fetchLock({ endpoints, network, id, decimals }) {
  return withClient(endpoints, network, async (c) => {
    const info = await c.getConnection().getAccountInfo(new PublicKey(id), 'confirmed');
    if (!info) return null;
    const s = await c.getOne({ id });
    const deposited = Number(s.depositedAmount.toString()) / 10 ** decimals;
    const withdrawn = Number(s.withdrawnAmount.toString()) / 10 ** decimals;
    return {
      deposited,
      withdrawn,
      remaining: Math.max(0, deposited - withdrawn),
      unlockAt: s.cliff,
      closed: !!s.closed,
      canceled: s.canceledAt > 0,
      mint: s.mint,
      recipient: s.recipient,
      cancelable: s.cancelableBySender || s.cancelableByRecipient,
    };
  });
}
