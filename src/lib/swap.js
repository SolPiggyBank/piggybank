// Swaps between SOL, USDC and USDT through Jupiter's router (GET /swap/v2/build).
//
// The transaction is put together here, not by Jupiter: our compute budget,
// PiggyBank's fee (a plain transfer of SWAP.feeBps of the amount to the fee
// wallet), then Jupiter's setup / swap / cleanup instructions.
//
// Nothing from the API is signed on trust:
// 1. Jupiter's helper instructions may not do anything dangerous with this
//    wallet: no delegates or new authorities, no SOL or tokens sent anywhere
//    but the wallet's own accounts, no reassigning the wallet.
// 2. The whole transaction is simulated, and every account of this wallet that
//    the transaction could change is compared before and after: the input
//    drops by exactly the amount, the output grows by at least the promised
//    minimum, SOL spent stays within the amount + fees + new accounts, every
//    other token account of the wallet stays untouched, and no account gains a
//    delegate, a close authority or a new owner.
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { rpc } from './rpc.js';
import { ATA_RENT_SOL, SOL_MINT, SWAP, TOKENS } from './config.js';
import { toBaseUnits, parseTx } from './solana.js';

const COMPUTE_BUDGET = ComputeBudgetProgram.programId.toBase58();
const SYSTEM = SystemProgram.programId.toBase58();
const TOKEN = TOKEN_PROGRAM_ID.toBase58();
const TOKEN_2022 = TOKEN_2022_PROGRAM_ID.toBase58();
const TOKEN_PROGRAMS = new Set([TOKEN, TOKEN_2022]);
const ATA_PROGRAM = ASSOCIATED_TOKEN_PROGRAM_ID.toBase58();
const MEMO_PROGRAMS = new Set(['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo']);
const MAX_CU = 1_400_000;
const CU_PRICE_DEFAULT = 100_000; // micro-lamports per compute unit
const CU_PRICE_MIN = 10_000;
const CU_PRICE_MAX = 2_000_000;
const PRIORITY_MAX_LAMPORTS = 500_000; // never more than 0.0005 SOL on priority
const TX_MAX_BYTES = 1232;
const ATA_RENT_LAMPORTS = Math.round(ATA_RENT_SOL * 1e9);
// the network fee (≤ 0.000505 SOL with the priority cap) and rounding, in the SOL check
const SOL_MARGIN_LAMPORTS = 1_000_000;
const RATE_TOLERANCE = 0.05; // a quote this far from the market price is refused
const PRICE_FRESH_MS = 10 * 60_000; // the market check only uses a recent SOL price

export const SWAP_TOKENS = ['USDC', 'USDT', 'SOL'];

export function mintOf(sym, network) {
  return sym === 'SOL' ? SOL_MINT : TOKENS[sym].mint[network];
}

const decimalsOf = (sym) => TOKENS[sym].decimals;

/** PiggyBank's share and what goes to the swap, in base units. */
export function splitFee(raw) {
  const fee = (raw * BigInt(SWAP.feeBps)) / 10_000n;
  return { fee, swap: raw - fee };
}

function fail(code, extra) {
  return Object.assign(new Error(code), extra || {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One /build call. Without an API key Jupiter allows about one request every
 * two seconds, so a 429 is retried after a pause before giving up.
 * Throws swap-busy (still rate limited), swap-no-route or swap-unavailable.
 */
export async function fetchBuild({ inputMint, outputMint, amount, taker, maxAccounts = 48, retries = SWAP.retryMs }) {
  const q = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    taker,
    slippageBps: String(SWAP.slippageBps),
    maxAccounts: String(maxAccounts),
    computeUnitPricePercentile: 'medium',
    wrapAndUnwrapSol: 'true',
  });
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    let res;
    try {
      res = await fetch(`${SWAP.api}/build?${q}`, {
        headers: SWAP.apiKey ? { 'x-api-key': SWAP.apiKey } : {},
        signal: ctrl.signal,
      });
    } catch {
      throw fail('swap-unavailable');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      if (attempt < retries.length) {
        await sleep(retries[attempt]);
        continue;
      }
      throw fail('swap-busy');
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok || !body) {
      if (/no route/i.test(body?.error || '')) throw fail('swap-no-route');
      throw fail('swap-unavailable');
    }
    return body;
  }
}

export function toInstruction(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: !!a.isSigner, isWritable: !!a.isWritable })),
    data: Buffer.from(ix.data || '', 'base64'),
  });
}

/**
 * Jupiter's helper instructions (setup, cleanup, other) may open accounts for
 * this wallet, wrap SOL and unwrap it back — nothing that hands anything to
 * someone else. Returns { setup, cleanup, other, cuPrice } or throws swap-unsafe.
 */
export function checkHelpers(build, owner) {
  const me = owner.toBase58();
  const unsafe = (why) => fail('swap-unsafe', { why });
  const keyAt = (ix, i) => ix.accounts?.[i]?.pubkey;
  const bytes = (ix) => Buffer.from(ix.data || '', 'base64');
  const created = new Set(); // accounts this transaction opens for the wallet
  for (const sym of SWAP_TOKENS) {
    const mint = sym === 'SOL' ? NATIVE_MINT : new PublicKey(TOKENS[sym].mint.mainnet);
    created.add(getAssociatedTokenAddressSync(mint, owner).toBase58());
  }

  let cuPrice = null;
  for (const ix of build.computeBudgetInstructions || []) {
    if (ix.programId !== COMPUTE_BUDGET) throw unsafe('budget-program');
    const d = bytes(ix);
    if (d[0] === 3 && d.length >= 9) cuPrice = Number(d.readBigUInt64LE(1));
  }

  const checkOne = (ix) => {
    const d = bytes(ix);
    const p = ix.programId;
    if (p === COMPUTE_BUDGET) return false; // our own budget goes first
    if (MEMO_PROGRAMS.has(p)) return true;
    if (p === ATA_PROGRAM) {
      // create / create-idempotent: payer, account, wallet, mint, system, token
      if (d.length > 1 || (d.length === 1 && d[0] > 1)) throw unsafe('ata-kind');
      if (keyAt(ix, 0) !== me) throw unsafe('ata-payer');
      if (keyAt(ix, 2) === me) created.add(keyAt(ix, 1));
      return true;
    }
    if (p === SYSTEM) {
      const op = d.length >= 4 ? d.readUInt32LE(0) : -1;
      if (op === 0 || op === 3) {
        // create an account (e.g. a temporary wSOL account) funded by the wallet, owned by a token program
        const ownerProgram = op === 0 ? new PublicKey(d.subarray(20, 52)).toBase58() : null;
        if (op === 0 && !TOKEN_PROGRAMS.has(ownerProgram)) throw unsafe('system-create');
        if (keyAt(ix, 0) === me) created.add(keyAt(ix, 1));
        return true;
      }
      if (op === 2) {
        // a transfer of the wallet's SOL may only go into its own (wSOL) account
        if (keyAt(ix, 0) === me && !created.has(keyAt(ix, 1))) throw unsafe('system-transfer');
        return true;
      }
      throw unsafe('system-op');
    }
    if (TOKEN_PROGRAMS.has(p)) {
      const op = d[0];
      if (op === 17) return true; // SyncNative
      if (op === 1 || op === 16 || op === 18) return true; // InitializeAccount(2/3): the owner is checked in the simulation
      if (op === 9) {
        // CloseAccount: whatever is left goes back to this wallet
        if (keyAt(ix, 1) !== me) throw unsafe('close-destination');
        return true;
      }
      throw unsafe('token-op'); // no transfers, approvals or authority changes in helpers
    }
    throw unsafe('helper-program');
  };

  const setup = (build.setupInstructions || []).filter(checkOne);
  const cleanup = build.cleanupInstruction && checkOne(build.cleanupInstruction) ? build.cleanupInstruction : null;
  const other = (build.otherInstructions || []).filter(checkOne);
  const swapIx = build.swapInstruction;
  if (!swapIx?.programId || !Array.isArray(swapIx.accounts)) throw fail('swap-unavailable');
  if (swapIx.accounts.some((a) => a.isSigner && a.pubkey !== me)) throw unsafe('signer');
  return { setup, cleanup, other, cuPrice };
}

/** The price per compute unit: Jupiter's suggestion, kept within sane bounds. */
export function clampCuPrice(suggested, cuLimit) {
  const byBudget = Math.floor((PRIORITY_MAX_LAMPORTS * 1e6) / Math.max(1, cuLimit));
  const base = suggested == null ? CU_PRICE_DEFAULT : suggested;
  return Math.max(1, Math.min(Math.max(base, CU_PRICE_MIN), CU_PRICE_MAX, byBudget));
}

function lookupTables(build) {
  return Object.entries(build.addressesByLookupTableAddress || {}).map(
    ([key, addresses]) =>
      new AddressLookupTableAccount({
        key: new PublicKey(key),
        state: {
          deactivationSlot: 18446744073709551615n,
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          authority: undefined,
          addresses: addresses.map((a) => new PublicKey(a)),
        },
      }),
  );
}

/** PiggyBank's fee: SOL by a plain transfer, tokens into the fee wallet's token account. */
export function feeInstructions({ owner, from, network, feeRaw, feeAccountExists }) {
  const feeWallet = new PublicKey(SWAP.feeWallet);
  if (from === 'SOL') return [SystemProgram.transfer({ fromPubkey: owner, toPubkey: feeWallet, lamports: feeRaw })];
  const mint = new PublicKey(mintOf(from, network));
  const source = getAssociatedTokenAddressSync(mint, owner);
  const dest = getAssociatedTokenAddressSync(mint, feeWallet);
  const ixs = [];
  if (!feeAccountExists) ixs.push(createAssociatedTokenAccountIdempotentInstruction(owner, dest, feeWallet, mint));
  ixs.push(createTransferCheckedInstruction(source, mint, dest, owner, feeRaw, decimalsOf(from)));
  return ixs;
}

/** The instructions of a swap, in order: budget, fee, Jupiter's setup, the swap, cleanup, other. */
export function swapInstructions({ cuLimit, cuPrice, feeIxs, helpers, build }) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }),
    ...feeIxs,
    ...helpers.setup.map(toInstruction),
    toInstruction(build.swapInstruction),
    ...(helpers.cleanup ? [toInstruction(helpers.cleanup)] : []),
    ...helpers.other.map(toInstruction),
  ];
}

export function compileSwap({ owner, blockhash, cuLimit, cuPrice, feeIxs, helpers, build }) {
  const instructions = swapInstructions({ cuLimit, cuPrice, feeIxs, helpers, build });
  const message = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions }).compileToV0Message(
    lookupTables(build),
  );
  const tx = new VersionedTransaction(message);
  if (tx.serialize().length > TX_MAX_BYTES) throw fail('swap-too-big');
  return tx;
}

// ---- reading accounts --------------------------------------------------

const b64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const u64 = (b, off) => new DataView(b.buffer, b.byteOffset).getBigUint64(off, true);
const pkAt = (b, off) => new PublicKey(b.slice(off, off + 32)).toBase58();
const dataOf = (acc) => (Array.isArray(acc?.data) ? acc.data[0] : acc?.data) || '';

/** An SPL token account (Token or Token-2022) as { mint, owner, amount, delegate, closeAuthority }, or null. */
export function readTokenAccount(acc) {
  if (!acc || !TOKEN_PROGRAMS.has(acc.owner)) return null;
  const b = b64(dataOf(acc));
  if (b.length < 165) return null;
  const v = new DataView(b.buffer, b.byteOffset);
  return {
    mint: pkAt(b, 0),
    owner: pkAt(b, 32),
    amount: u64(b, 64),
    delegate: v.getUint32(72, true) ? pkAt(b, 76) : null,
    closeAuthority: v.getUint32(129, true) ? pkAt(b, 133) : null,
  };
}

/**
 * Which accounts to compare in the simulation: the wallet, the input and
 * output token accounts, and every token account of this wallet that the
 * transaction could write to (an account can only change if it's writable in
 * some instruction).
 */
export function watchList({ owner, from, to, network, writable, pre }) {
  const me = owner.toBase58();
  const ataOf = (sym) => getAssociatedTokenAddressSync(new PublicKey(mintOf(sym, network)), owner).toBase58();
  const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, owner).toBase58();
  const roles = new Map([[me, 'wallet']]);
  if (from !== 'SOL') roles.set(ataOf(from), 'in');
  if (to !== 'SOL') roles.set(ataOf(to), 'out');
  if (!roles.has(wsol)) roles.set(wsol, 'wsol');
  writable.forEach((address, i) => {
    if (roles.has(address)) return;
    const t = readTokenAccount(pre[i]);
    if (t && t.owner === me) roles.set(address, 'other');
  });
  return [...roles].map(([address, role]) => ({ address, role }));
}

/** Compares the wallet's accounts before and after the simulated swap; throws swap-unsafe. */
export function verifyOutcome({ owner, watch, pre, post, to, inRaw, minOutRaw, solSpendMax, solOutCosts = 0 }) {
  const me = owner.toBase58();
  const unsafe = (why) => fail('swap-unsafe', { why });
  watch.forEach((w, i) => {
    const before = pre[i];
    const after = post[i];
    if (w.role === 'wallet') {
      if (!after || after.owner !== SYSTEM) throw unsafe('wallet-owner');
      if (dataOf(after).length) throw unsafe('wallet-data');
      const delta = BigInt(after.lamports) - BigInt(before?.lamports || 0);
      if (delta < -BigInt(solSpendMax)) throw unsafe('sol-spent');
      // SOL out: at least the minimum, less the network fee and accounts this swap pays for
      if (to === 'SOL' && delta < minOutRaw - BigInt(solOutCosts + SOL_MARGIN_LAMPORTS)) throw unsafe('sol-out');
      return;
    }
    const a = readTokenAccount(before);
    const b = readTokenAccount(after);
    if (w.role === 'wsol') {
      // the temporary wSOL account is opened and closed again; whatever it held comes back as SOL
      if (b && (b.owner !== me || b.delegate || b.closeAuthority)) throw unsafe('wsol-authority');
      return;
    }
    if (!b) {
      if (w.role === 'out') throw unsafe('out-missing');
      if (a) throw unsafe('account-closed');
      return;
    }
    if (b.owner !== me) throw unsafe('authority');
    if (b.delegate !== (a?.delegate ?? null) || b.closeAuthority !== (a?.closeAuthority ?? null)) {
      if (b.delegate || b.closeAuthority) throw unsafe('authority');
    }
    const delta = b.amount - (a?.amount || 0n);
    if (w.role === 'in' && delta !== -inRaw) throw unsafe('in-amount');
    if (w.role === 'out' && delta < minOutRaw) throw unsafe('out-amount');
    if (w.role === 'other' && delta !== 0n) throw unsafe('other-moved');
  });
}

// a system account must keep at least this much SOL (rent exemption for 0 bytes)
const RENT_EXEMPT_EMPTY = 890_880;
let feeWalletFunded = false;
/** A SOL fee into an empty fee wallet below the rent minimum would make the network refuse the swap. */
async function feeWalletCanTakeSol(endpoints, feeRaw) {
  if (feeWalletFunded) return true;
  const r = await rpc(endpoints, 'getBalance', [SWAP.feeWallet, { commitment: 'confirmed' }]);
  const lamports = BigInt(r?.value ?? r ?? 0);
  if (lamports >= BigInt(RENT_EXEMPT_EMPTY)) feeWalletFunded = true;
  return lamports + feeRaw >= BigInt(RENT_EXEMPT_EMPTY);
}

const feeAccountKnown = new Set();

/** Forgets what is known about the fee wallet's accounts (tests). */
export function resetSwapCaches() {
  feeWalletFunded = false;
  feeAccountKnown.clear();
}
async function feeAccountExists(endpoints, from, network) {
  if (from === 'SOL') return true;
  const mint = new PublicKey(mintOf(from, network));
  const dest = getAssociatedTokenAddressSync(mint, new PublicKey(SWAP.feeWallet)).toBase58();
  if (feeAccountKnown.has(dest)) return true;
  const info = await rpc(endpoints, 'getAccountInfo', [dest, { encoding: 'base64', commitment: 'confirmed' }]);
  if (info?.value) feeAccountKnown.add(dest);
  return !!info?.value;
}

/** A quote this far from the market price is a bad route (or a bad API answer). */
export function rateLooksWrong({ from, to, swapAmount, outAmount, solPrice }) {
  if (!(swapAmount > 0) || !(outAmount > 0)) return true;
  if (from !== 'SOL' && to !== 'SOL') return Math.abs(outAmount / swapAmount - 1) > RATE_TOLERANCE;
  if (!solPrice) return false;
  const implied = from === 'SOL' ? outAmount / swapAmount : swapAmount / outAmount;
  return Math.abs(implied / solPrice - 1) > RATE_TOLERANCE;
}

function simError(value) {
  const logs = (value?.logs || []).join('\n');
  const text = `${JSON.stringify(value?.err || '')} ${logs}`.toLowerCase();
  if (text.includes('slippage') || text.includes('0x1771')) return fail('swap-slippage');
  if (text.includes('insufficient lamports') || text.includes('insufficientfundsforrent')) return fail('swap-insufficient-sol');
  if (text.includes('insufficient funds')) return fail('swap-insufficient-token');
  return fail('swap-sim-failed', { data: value?.err });
}

const writableOf = (ixs) => {
  const seen = new Set();
  for (const ix of ixs) for (const k of ix.keys) if (k.isWritable) seen.add(k.pubkey.toBase58());
  return [...seen];
};

/**
 * Asks Jupiter for a route, builds the transaction and simulates it.
 * amount: decimal string in `from` units. Returns a quote the UI can show and
 * executeSwap can sign.
 */
export async function quoteSwap({ endpoints, network, owner, from, to, amount, prices }) {
  if (network !== 'mainnet') throw fail('swap-mainnet-only');
  if (from === to || !SWAP_TOKENS.includes(from) || !SWAP_TOKENS.includes(to)) throw fail('swap-pair');
  const ownerPk = new PublicKey(owner);
  const inRaw = toBaseUnits(amount, decimalsOf(from));
  const { fee: feeRaw, swap: swapRaw } = splitFee(inRaw);
  if (feeRaw <= 0n || swapRaw <= 0n) throw fail('swap-too-small');

  const inputMint = mintOf(from, network);
  const outputMint = mintOf(to, network);
  const check = (b) => {
    if (b.inputMint !== inputMint || b.outputMint !== outputMint || String(b.inAmount) !== String(swapRaw)) {
      throw fail('swap-unavailable', { why: 'mismatch' });
    }
    const out = BigInt(b.outAmount);
    const min = BigInt(b.otherAmountThreshold);
    if (min <= 0n || min > out) throw fail('swap-unavailable', { why: 'threshold' });
  };
  let build = await fetchBuild({ inputMint, outputMint, amount: swapRaw, taker: owner });
  check(build);

  const swapAmount = Number(swapRaw) / 10 ** decimalsOf(from);
  const freshPrice = prices?.SOL && (!prices.ts || Date.now() - prices.ts < PRICE_FRESH_MS) ? prices.SOL : null;
  const marketCheck = (b) => {
    const outAmount = Number(BigInt(b.outAmount)) / 10 ** decimalsOf(to);
    if (rateLooksWrong({ from, to, swapAmount, outAmount, solPrice: freshPrice })) throw fail('swap-bad-rate');
  };
  marketCheck(build);

  if (from === 'SOL' && !(await feeWalletCanTakeSol(endpoints, feeRaw))) throw fail('swap-fee-wallet');
  const feeExists = await feeAccountExists(endpoints, from, network);
  const feeIxs = feeInstructions({ owner: ownerPk, from, network, feeRaw, feeAccountExists: feeExists });
  const { value: bh } = await rpc(endpoints, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);

  let helpers = checkHelpers(build, ownerPk);
  const compile = () =>
    compileSwap({ owner: ownerPk, blockhash: bh.blockhash, cuLimit: MAX_CU, cuPrice: clampCuPrice(helpers.cuPrice, MAX_CU), feeIxs, helpers, build });
  let tx;
  try {
    tx = compile();
  } catch (e) {
    if (e.message !== 'swap-too-big') throw e;
    // a route with fewer accounts leaves room for the fee transfer
    build = await fetchBuild({ inputMint, outputMint, amount: swapRaw, taker: owner, maxAccounts: 28 });
    check(build);
    marketCheck(build);
    helpers = checkHelpers(build, ownerPk);
    tx = compile();
  }
  const outRaw = BigInt(build.outAmount);
  const minOutRaw = BigInt(build.otherAmountThreshold);

  // everything the transaction can write to, before…
  const writable = writableOf(swapInstructions({ cuLimit: MAX_CU, cuPrice: 1, feeIxs, helpers, build }));
  const preWritable = [];
  for (let i = 0; i < writable.length; i += 100) {
    const r = await rpc(endpoints, 'getMultipleAccounts', [writable.slice(i, i + 100), { encoding: 'base64', commitment: 'confirmed' }]);
    preWritable.push(...(r?.value || []));
  }
  const watch = watchList({ owner: ownerPk, from, to, network, writable, pre: preWritable });
  const addresses = watch.map((w) => w.address);
  const preRes = await rpc(endpoints, 'getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }]);
  const pre = preRes?.value || [];
  const outIdx = watch.findIndex((w) => w.role === 'out');
  const needsOutAccount = outIdx >= 0 && !pre[outIdx];

  // …and after
  const sim = await rpc(endpoints, 'simulateTransaction', [
    Buffer.from(tx.serialize()).toString('base64'),
    {
      encoding: 'base64',
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'confirmed',
      accounts: { encoding: 'base64', addresses },
    },
  ]);
  const v = sim?.value;
  if (!v) throw fail('swap-unavailable', { why: 'simulation' });
  if (v.err) throw simError(v);

  const permanentRent = (needsOutAccount ? ATA_RENT_LAMPORTS : 0) + (feeExists ? 0 : ATA_RENT_LAMPORTS);
  const tempRent = from === 'SOL' || to === 'SOL' ? ATA_RENT_LAMPORTS : 0;
  const solIn = from === 'SOL' ? inRaw : 0n;
  verifyOutcome({
    owner: ownerPk,
    watch,
    pre,
    post: v.accounts || [],
    to,
    inRaw,
    minOutRaw,
    solSpendMax: solIn + BigInt(permanentRent + SOL_MARGIN_LAMPORTS),
    solOutCosts: permanentRent,
  });

  const units = Number(v.unitsConsumed || 0) || 300_000;
  const cuLimit = Math.min(MAX_CU, Math.ceil(units * 1.2) + 2_000);
  const cuPrice = clampCuPrice(helpers.cuPrice, cuLimit);
  const networkFeeLamports = 5000 + Math.ceil((cuPrice * cuLimit) / 1e6);
  const outDec = decimalsOf(to);
  const labels = [...new Set((build.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean))];
  return {
    from,
    to,
    network,
    amountText: String(amount),
    amountIn: Number(inRaw) / 10 ** decimalsOf(from),
    fee: Number(feeRaw) / 10 ** decimalsOf(from),
    swapAmount,
    outAmount: Number(outRaw) / 10 ** outDec,
    minOut: Number(minOutRaw) / 10 ** outDec,
    inRaw,
    feeRaw,
    outRaw,
    priceImpact: Number(build.priceImpactPct || 0),
    route: labels,
    networkFeeSol: networkFeeLamports / 1e9,
    rentSol: permanentRent / 1e9,
    needsOutAccount,
    feeAccountExists: feeExists,
    // SOL that has to be free: the amount itself when paying in SOL, the fee, new accounts,
    // and the temporary wSOL account that is closed again in the same transaction
    solNeeded: (Number(solIn) + networkFeeLamports + permanentRent + tempRent) / 1e9,
    cuLimit,
    cuPrice,
    build,
    helpers,
    createdAt: Date.now(),
  };
}

/** Signs and broadcasts a quote from quoteSwap. Returns { signature, raw, lastValidBlockHeight }. */
export async function executeSwap({ endpoints, keypair, quote }) {
  const owner = keypair.publicKey;
  const feeIxs = feeInstructions({
    owner,
    from: quote.from,
    network: quote.network,
    feeRaw: quote.feeRaw,
    feeAccountExists: quote.feeAccountExists,
  });
  const { value: bh } = await rpc(endpoints, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = compileSwap({
    owner,
    blockhash: bh.blockhash,
    cuLimit: quote.cuLimit,
    cuPrice: quote.cuPrice,
    feeIxs,
    helpers: quote.helpers,
    build: quote.build,
  });
  tx.sign([keypair]);
  const raw = Buffer.from(tx.serialize()).toString('base64');
  const signature = await rpc(endpoints, 'sendTransaction', [
    raw,
    { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 0 },
  ]);
  return { signature, raw, lastValidBlockHeight: bh.lastValidBlockHeight };
}

/** What actually arrived, read from the confirmed transaction (null if it can't be read yet). */
export async function swapResult({ endpoints, signature, owner, network, to, rentSol = 0 }) {
  const mintToSym = {};
  for (const sym of ['USDC', 'USDT']) if (TOKENS[sym].mint[network]) mintToSym[TOKENS[sym].mint[network]] = sym;
  for (let i = 0; i < 3; i++) {
    const tx = await rpc(endpoints, 'getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
    ]).catch(() => null);
    if (tx) {
      const change = parseTx(tx, owner, mintToSym).changes.find((c) => c.token === to && c.delta > 0);
      // in SOL, the rent for an account opened by the same transaction is not part of what arrived
      return change ? change.delta + (to === 'SOL' ? rentSol : 0) : null;
    }
    await sleep(1500);
  }
  return null;
}
