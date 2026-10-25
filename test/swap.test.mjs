// Swap module: fee maths, transaction assembly and the safety checks, against a
// fake Jupiter /build and a fake RPC (fetch is replaced).
import assert from 'node:assert/strict';
import { Keypair, PublicKey, SystemProgram, ComputeBudgetProgram, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ed25519 } from '@noble/curves/ed25519';
import '../src/polyfills.js';
import { SWAP } from '../src/lib/config.js';
import { splitFee, quoteSwap, executeSwap, clampCuPrice, rateLooksWrong, readTokenAccount, resetSwapCaches } from '../src/lib/swap.js';

SWAP.retryMs = [5, 5]; // keep the rate-limit retries quick in tests

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const SOL = 'So11111111111111111111111111111111111111112';
const JUP6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const FEE = new PublicKey(SWAP.feeWallet);
const kp = Keypair.generate();
const owner = kp.publicKey;
const me = owner.toBase58();
const ata = (mint, who = owner) => getAssociatedTokenAddressSync(new PublicKey(mint), who).toBase58();
const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, owner).toBase58();
const endpoints = ['https://rpc.test'];
const prices = { SOL: 170, USDC: 1, USDT: 1 };

// ---- a tiny chain ---------------------------------------------------------
function tokenData(mint, who, amount, { delegate, closeAuthority } = {}) {
  const b = Buffer.alloc(165);
  new PublicKey(mint).toBuffer().copy(b, 0);
  new PublicKey(who).toBuffer().copy(b, 32);
  b.writeBigUInt64LE(BigInt(amount), 64);
  if (delegate) {
    b.writeUInt32LE(1, 72);
    new PublicKey(delegate).toBuffer().copy(b, 76);
  }
  b[108] = 1;
  if (closeAuthority) {
    b.writeUInt32LE(1, 129);
    new PublicKey(closeAuthority).toBuffer().copy(b, 133);
  }
  return b.toString('base64');
}
const tokenAcc = (mint, who, amount, extra) => ({ data: [tokenData(mint, who, amount, extra), 'base64'], owner: TOKEN_PROGRAM_ID.toBase58(), lamports: 2039280, executable: false });
const walletAcc = (lamports) => ({ data: ['', 'base64'], owner: '11111111111111111111111111111111', lamports, executable: false });

let chain; // address -> account
let scenario; // knobs for the fake Jupiter / simulation
let sent;
function reset() {
  chain = {
    [me]: walletAcc(2_000_000_000),
    [ata(USDC)]: tokenAcc(USDC, me, 250_000_000),
    [ata(USDT)]: tokenAcc(USDT, me, 40_000_000),
    [ata(USDC, FEE)]: tokenAcc(USDC, FEE.toBase58(), 0),
    [FEE.toBase58()]: walletAcc(50_000_000),
  };
  scenario = { status: 200, busyFor: 0, rate: null, evil: null, setupEvil: false, simErr: null, units: 180_000, variant: null, badHelper: null };
  sent = [];
}

const ix = (programId, accounts, data) => ({ programId, accounts, data: Buffer.from(data).toString('base64') });
const acc = (pubkey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });

function buildResponse(params) {
  const inputMint = params.get('inputMint');
  const outputMint = params.get('outputMint');
  const amount = BigInt(params.get('amount'));
  const usd = (mint, raw) => (mint === SOL ? (Number(raw) / 1e9) * 170 : Number(raw) / 1e6);
  const inUsd = usd(inputMint, amount) * (scenario.rate ?? 0.998);
  const outRaw = outputMint === SOL ? BigInt(Math.floor((inUsd / 170) * 1e9)) : BigInt(Math.floor(inUsd * 1e6));
  const setup = [];
  if (outputMint !== SOL) setup.push(ix(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), [acc(me, true, true), acc(ata(outputMint), true), acc(me), acc(outputMint), acc('11111111111111111111111111111111'), acc(TOKEN_PROGRAM_ID.toBase58())], [1]));
  let cleanup = null;
  if (inputMint === SOL || outputMint === SOL) {
    setup.push(ix(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), [acc(me, true, true), acc(wsol, true), acc(me), acc(SOL), acc('11111111111111111111111111111111'), acc(TOKEN_PROGRAM_ID.toBase58())], [1]));
    cleanup = ix(TOKEN_PROGRAM_ID.toBase58(), [acc(wsol, true), acc(me, true), acc(me, false, true)], [9]);
  }
  if (inputMint === SOL) {
    const d = Buffer.alloc(12);
    d.writeUInt32LE(2, 0);
    d.writeBigUInt64LE(amount, 4);
    const to = scenario.setupEvil ? Keypair.generate().publicKey.toBase58() : wsol;
    setup.push(ix('11111111111111111111111111111111', [acc(me, true, true), acc(to, true)], d));
    setup.push(ix(TOKEN_PROGRAM_ID.toBase58(), [acc(wsol, true)], [17]));
  }
  if (scenario.variant === 'legacy-ata') for (const i of setup) if (i.programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) i.data = '';
  if (scenario.variant === 'temp-wsol' && inputMint === SOL) {
    // a temporary wSOL account instead of the ATA: create, initialize, close
    const tmp = Keypair.generate().publicKey.toBase58();
    const create = Buffer.alloc(52);
    create.writeUInt32LE(0, 0);
    create.writeBigUInt64LE(amount + 2039280n, 4);
    create.writeBigUInt64LE(165n, 12);
    TOKEN_PROGRAM_ID.toBuffer().copy(create, 20);
    const init = Buffer.concat([Buffer.from([18]), owner.toBuffer()]);
    setup.length = 0;
    setup.push(ix('11111111111111111111111111111111', [acc(me, true, true), acc(tmp, true, true)], create));
    setup.push(ix(TOKEN_PROGRAM_ID.toBase58(), [acc(tmp, true), acc(SOL)], init));
    cleanup = ix(TOKEN_PROGRAM_ID.toBase58(), [acc(tmp, true), acc(me, true), acc(me, false, true)], [9]);
  }
  const bad = Keypair.generate().publicKey.toBase58();
  if (scenario.badHelper === 'approve') setup.push(ix(TOKEN_PROGRAM_ID.toBase58(), [acc(ata(USDC), true), acc(bad), acc(me, false, true)], Buffer.from([4, 1, 0, 0, 0, 0, 0, 0, 0])));
  if (scenario.badHelper === 'close-foreign') cleanup = ix(TOKEN_PROGRAM_ID.toBase58(), [acc(wsol, true), acc(bad, true), acc(me, false, true)], [9]);
  if (scenario.badHelper === 'assign') setup.push(ix('11111111111111111111111111111111', [acc(me, true, true)], Buffer.concat([Buffer.from([1, 0, 0, 0]), new PublicKey(bad).toBuffer()])));
  if (scenario.badHelper === 'unknown') setup.push(ix(bad, [acc(me, true, true)], [0]));
  const other = scenario.variant === 'memo' ? [ix('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', [], Buffer.from('piggy'))] : [];
  const swapAccounts = [acc(me, false, true), acc(inputMint === SOL ? wsol : ata(inputMint), true), acc(outputMint === SOL ? wsol : ata(outputMint), true), acc(Keypair.generate().publicKey.toBase58(), true)];
  if (scenario.evil === 'other-moved' || scenario.evil === 'other-delegate') swapAccounts.push(acc(ata(USDT), true));
  const price = Buffer.alloc(9);
  price[0] = 3;
  price.writeBigUInt64LE(250_000n, 1);
  scenario.lastOut = outRaw;
  scenario.lastIn = { mint: inputMint, raw: amount };
  return {
    inputMint,
    outputMint,
    inAmount: String(amount),
    outAmount: String(outRaw),
    otherAmountThreshold: String((outRaw * 995n) / 1000n),
    swapMode: 'ExactIn',
    slippageBps: 50,
    priceImpactPct: '0.0004',
    routePlan: [{ percent: 100, bps: 10000, swapInfo: { ammKey: me, label: 'Whirlpool', inputMint, outputMint, inAmount: String(amount), outAmount: String(outRaw) } }],
    computeBudgetInstructions: [ix(ComputeBudgetProgram.programId.toBase58(), [], price)],
    setupInstructions: setup,
    swapInstruction: ix(JUP6, swapAccounts, Buffer.from('e517cb977ae3ad2a0100000011', 'hex')),
    cleanupInstruction: cleanup,
    otherInstructions: other,
    addressesByLookupTableAddress: {},
    transactionVersion: 0,
    blockhashWithMetadata: { blockhash: Array.from(Keypair.generate().publicKey.toBytes()), lastValidBlockHeight: 1000 },
  };
}

function simulate(params) {
  if (scenario.simErr) return { value: { err: { InstructionError: [4, { Custom: 6001 }] }, logs: ['Program log: Error: SlippageToleranceExceeded'], accounts: null, unitsConsumed: 90000 } };
  const addrs = params[1].accounts.addresses;
  const { mint: inMint, raw: swapRaw } = scenario.lastIn;
  // the fee as the transaction itself moves it (a SOL transfer or a TransferChecked to the fee wallet)
  const list = ixs(decode(params[0]));
  const feeIx =
    list.find((i) => i.program === SystemProgram.programId.toBase58() && i.keys[1] === FEE.toBase58()) ||
    list.find((i) => i.program === TOKEN_PROGRAM_ID.toBase58() && i.data[0] === 12);
  const feeRaw = !feeIx ? 0n : feeIx.program === SystemProgram.programId.toBase58() ? feeIx.data.readBigUInt64LE(4) : feeIx.data.readBigUInt64LE(1);
  const inRaw = swapRaw + feeRaw;
  const post = addrs.map((a) => {
    const cur = chain[a];
    if (a === wsol) return null; // the temporary wSOL account is closed again
    if (a === me) {
      let lamports = BigInt(cur.lamports) - 5000n;
      if (chain[wsol]) lamports += readTokenAccount(chain[wsol]).amount + 2039280n; // an old wSOL balance comes back as SOL
      if (inMint === SOL) lamports -= inRaw;
      if (scenario.outMint === SOL) lamports += scenario.evil === 'sol-short' ? scenario.lastOut / 2n : scenario.lastOut;
      if (inMint !== SOL && !chain[ata(inMint, FEE)]) lamports -= 2039280n; // rent for the fee wallet's new account
      if (scenario.evil === 'wallet-owner') return { ...walletAcc(Number(lamports)), owner: 'BPFLoaderUpgradeab1e11111111111111111111111' };
      return walletAcc(Number(lamports));
    }
    const t = cur ? readTokenAccount(cur) : null;
    if (a === ata(inMint) && t) {
      const fee = feeRaw;
      const delta = scenario.evil === 'in-more' ? swapRaw + fee + 5n : swapRaw + fee;
      return tokenAcc(t.mint, t.owner, t.amount - delta);
    }
    if (scenario.outMint !== SOL && a === ata(scenario.outMint)) {
      const base = t ? t.amount : 0n;
      if (scenario.evil === 'no-out') return tokenAcc(scenario.outMint, me, base);
      if (scenario.evil === 'delegate') return tokenAcc(scenario.outMint, me, base + scenario.lastOut, { delegate: Keypair.generate().publicKey.toBase58() });
      return tokenAcc(scenario.outMint, me, base + scenario.lastOut);
    }
    if (cur && scenario.evil === 'other-moved' && t) return tokenAcc(t.mint, t.owner, t.amount - 1n);
    if (cur && scenario.evil === 'other-delegate' && t) return tokenAcc(t.mint, t.owner, t.amount, { delegate: Keypair.generate().publicKey.toBase58() });
    return cur || null;
  });
  void inRaw;
  return { value: { err: null, logs: [], accounts: post, unitsConsumed: scenario.units } };
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'api.jup.ag') {
    if (scenario.status === 429) return new Response('slow down', { status: 429 });
    if (scenario.busyFor > 0) {
      scenario.busyFor--;
      return new Response('slow down', { status: 429 });
    }
    if (scenario.status === 400) return new Response(JSON.stringify({ error: 'No routes found' }), { status: 400 });
    scenario.outMint = u.searchParams.get('outputMint');
    scenario.maxAccounts = u.searchParams.get('maxAccounts');
    return new Response(JSON.stringify(buildResponse(u.searchParams)), { status: 200 });
  }
  const body = JSON.parse(opts.body);
  const answer = (result) => new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200 });
  switch (body.method) {
    case 'getBalance':
      return answer({ value: chain[body.params[0]]?.lamports ?? 0 });
    case 'getAccountInfo':
      return answer({ value: chain[body.params[0]] || null });
    case 'getMultipleAccounts':
      return answer({ value: body.params[0].map((a) => chain[a] || null) });
    case 'getLatestBlockhash':
      return answer({ value: { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 900 } });
    case 'simulateTransaction':
      return answer(simulate(body.params));
    case 'sendTransaction':
      sent.push(body.params[0]);
      return answer('5'.repeat(64));
    default:
      throw new Error('unexpected RPC ' + body.method);
  }
};

const quote = (from, to, amount) =>
  quoteSwap({ endpoints, network: 'mainnet', owner: me, from, to, amount, prices, balances: { accounts: { USDC: [{ pubkey: ata(USDC) }], USDT: [{ pubkey: ata(USDT) }] } } });
const rejects = async (p, code) => {
  await assert.rejects(p, (e) => {
    assert.equal(e.message, code);
    return true;
  });
};
const decode = (raw) => VersionedTransaction.deserialize(Buffer.from(raw, 'base64'));
function ixs(tx) {
  const keys = tx.message.staticAccountKeys;
  return tx.message.compiledInstructions.map((c) => ({
    program: keys[c.programIdIndex].toBase58(),
    keys: c.accountKeyIndexes.map((i) => keys[i].toBase58()),
    data: Buffer.from(c.data),
  }));
}

// 1. the fee maths
{
  const { fee, swap } = splitFee(100_000_000n);
  assert.equal(fee, 700_000n);
  assert.equal(swap, 99_300_000n);
  assert.equal(splitFee(142n).fee, 0n, 'dust has no fee (and is refused as too small)');
  assert.equal(SWAP.feeBps, 70, '0.7 %');
  assert.equal(new PublicKey(SWAP.feeWallet).toBase58(), 'D52FHmr9jZF7TQT26VpDoZcu77qtSWPmPGcb36c8ThmQ');
  console.log('ok - fee is exactly 0.7 % and goes to D52F…ThmQ');
}

// 2. USDC → SOL: fee is a TransferChecked of 0.7 USDC into the fee wallet's USDC account
{
  reset();
  const q = await quote('USDC', 'SOL', '100');
  assert.equal(q.fee, 0.7);
  assert.equal(q.swapAmount, 99.3);
  assert.ok(q.outAmount > 0.57 && q.outAmount < 0.59, `≈0.58 SOL, got ${q.outAmount}`);
  assert.ok(q.minOut < q.outAmount);
  assert.ok(q.feeAccountExists);
  assert.equal(q.rentSol, 0);
  assert.equal(q.cuLimit, Math.ceil(180_000 * 1.2) + 2000);
  assert.ok(q.networkFeeSol < 0.0006, 'priority fee stays bounded');
  const res = await executeSwap({ endpoints, keypair: kp, quote: q });
  const tx = decode(sent.at(-1));
  assert.equal(tx.message.staticAccountKeys[0].toBase58(), me, 'the owner pays');
  assert.ok(ed25519.verify(tx.signatures[0], tx.message.serialize(), owner.toBytes()), 'signed by the owner');
  const list = ixs(tx);
  const cb = list.filter((i) => i.program === ComputeBudgetProgram.programId.toBase58());
  assert.equal(cb.length, 2, 'our CU limit and price only');
  const transfer = list.find((i) => i.program === TOKEN_PROGRAM_ID.toBase58() && i.data[0] === 12);
  assert.ok(transfer, 'TransferChecked');
  assert.equal(transfer.data.readBigUInt64LE(1), 700_000n, '0.7 USDC');
  assert.equal(transfer.data[9], 6);
  assert.equal(transfer.keys[0], ata(USDC), 'from the owner’s USDC account');
  assert.equal(transfer.keys[2], ata(USDC, FEE), 'to the fee wallet’s USDC account');
  assert.equal(transfer.keys[3], me, 'authority: owner');
  assert.ok(list.some((i) => i.program === JUP6), 'the swap');
  assert.ok(!list.some((i) => i.program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() && i.keys.includes(FEE.toBase58())), 'no account created for the fee wallet');
  assert.equal(typeof res.signature, 'string');
  console.log('ok - USDC→SOL: 0.7 USDC fee transfer, owner-signed, Jupiter swap after it');
}

// 3. SOL → USDT: fee is a SystemProgram transfer of 0.7 % of the lamports
{
  reset();
  const q = await quote('SOL', 'USDT', '1');
  assert.equal(q.fee, 0.007);
  assert.ok(q.outAmount > 165 && q.outAmount < 170);
  assert.ok(q.solNeeded > 1 && q.solNeeded < 1.01, 'the amount plus fees and the temporary wSOL account');
  await executeSwap({ endpoints, keypair: kp, quote: q });
  const list = ixs(decode(sent.at(-1)));
  const sys = list.filter((i) => i.program === SystemProgram.programId.toBase58());
  const fee = sys.find((i) => i.keys[1] === FEE.toBase58());
  assert.ok(fee, 'system transfer to the fee wallet');
  assert.equal(fee.data.readUInt32LE(0), 2);
  assert.equal(fee.data.readBigUInt64LE(4), 7_000_000n, '0.007 SOL');
  assert.ok(sys.some((i) => i.keys[1] === wsol), 'and the wrap into the owner’s wSOL account');
  console.log('ok - SOL→USDT: 0.007 SOL fee by a plain transfer, wrap/unwrap only on the owner’s accounts');
}

// 4. the fee wallet has no USDT account yet: it is opened (and its rent counted)
{
  reset();
  const q = await quote('USDT', 'USDC', '10');
  assert.equal(q.feeAccountExists, false);
  assert.ok(Math.abs(q.rentSol - 0.00203928) < 1e-9);
  await executeSwap({ endpoints, keypair: kp, quote: q });
  const list = ixs(decode(sent.at(-1)));
  const create = list.find((i) => i.program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() && i.keys[2] === FEE.toBase58());
  assert.ok(create, 'create idempotent for the fee wallet');
  assert.equal(create.keys[0], me);
  assert.equal(create.keys[1], ata(USDT, FEE));
  console.log('ok - missing fee account is opened in the same transaction, rent shown');
}

// 5. nothing from the API is signed on trust
{
  reset();
  scenario.setupEvil = true;
  await rejects(quote('SOL', 'USDC', '1'), 'swap-unsafe');
  for (const [evil, from, to] of [
    ['no-out', 'USDC', 'USDT'],
    ['delegate', 'USDC', 'USDT'],
    ['other-moved', 'USDC', 'SOL'],
    ['other-delegate', 'USDC', 'SOL'],
    ['in-more', 'USDC', 'SOL'],
    ['wallet-owner', 'USDC', 'SOL'],
  ]) {
    reset();
    scenario.evil = evil;
    await rejects(quote(from, to, '20'), 'swap-unsafe');
  }
  reset();
  scenario.rate = 0.8;
  await rejects(quote('USDC', 'SOL', '50'), 'swap-bad-rate');
  reset();
  scenario.simErr = true;
  await rejects(quote('USDC', 'SOL', '50'), 'swap-slippage');
  assert.equal(sent.length, 0, 'nothing was sent');
  for (const [bad, from] of [['approve', 'USDC'], ['close-foreign', 'SOL'], ['assign', 'USDC'], ['unknown', 'USDC']]) {
    reset();
    scenario.badHelper = bad;
    await rejects(quote(from, from === 'SOL' ? 'USDC' : 'SOL', from === 'SOL' ? '1' : '20'), 'swap-unsafe');
  }
  assert.equal(sent.length, 0, 'nothing was sent');
  console.log('ok - refused: foreign SOL transfer, missing output, delegates, other account moved, overdraw, wallet reassigned, approvals, closing to someone else, unknown programs, bad rate, slippage');
}

// 5b. the shapes Jupiter may use for the same chores are all fine
{
  for (const [variant, from, to] of [
    ['legacy-ata', 'USDC', 'USDT'],
    ['temp-wsol', 'SOL', 'USDC'],
    ['memo', 'USDT', 'SOL'],
  ]) {
    reset();
    scenario.variant = variant;
    const q = await quote(from, to, from === 'SOL' ? '1' : '30');
    await executeSwap({ endpoints, keypair: kp, quote: q });
  }
  // an old wSOL balance in the wallet's wSOL account is unwrapped back to SOL, not a problem
  reset();
  chain[wsol] = tokenAcc(SOL, me, 50_000_000);
  await quote('USDC', 'SOL', '40');
  // a short rate limit is waited out
  reset();
  scenario.busyFor = 2;
  const q = await quote('USDC', 'SOL', '12');
  assert.ok(q.outAmount > 0);
  console.log('ok - accepted: legacy ATA create, temporary wSOL account, memo, old wSOL balance, rate limit waited out');
}

// 6. API trouble and small things
{
  reset();
  scenario.status = 429;
  await rejects(quote('USDC', 'SOL', '5'), 'swap-busy');
  reset();
  scenario.status = 400;
  await rejects(quote('USDC', 'SOL', '5'), 'swap-no-route');
  await rejects(quoteSwap({ endpoints, network: 'devnet', owner: me, from: 'USDC', to: 'SOL', amount: '5', prices }), 'swap-mainnet-only');
  await rejects(quoteSwap({ endpoints, network: 'mainnet', owner: me, from: 'SOL', to: 'SOL', amount: '5', prices }), 'swap-pair');
  assert.equal(clampCuPrice(null, 200_000), 100_000);
  assert.equal(clampCuPrice(50, 200_000), 10_000, 'a floor so it lands');
  assert.equal(clampCuPrice(10_000_000, 1_400_000), Math.floor((500_000 * 1e6) / 1_400_000), 'priority never above 0.0005 SOL');
  assert.equal(rateLooksWrong({ from: 'USDC', to: 'USDT', swapAmount: 100, outAmount: 99.9 }), false);
  assert.equal(rateLooksWrong({ from: 'USDC', to: 'USDT', swapAmount: 100, outAmount: 90 }), true);
  assert.equal(rateLooksWrong({ from: 'SOL', to: 'USDC', swapAmount: 1, outAmount: 168, solPrice: 170 }), false);
  assert.equal(rateLooksWrong({ from: 'USDC', to: 'SOL', swapAmount: 170, outAmount: 0.5, solPrice: 170 }), true);
  console.log('ok - rate limit, no route, devnet, same token, CU price bounds, market check');
}

// 7. a small swap into SOL that also opens the fee wallet's account: the rent is
//    a cost of the swap, not a short payout
{
  reset();
  const q = await quote('USDT', 'SOL', '1');
  assert.equal(q.feeAccountExists, false);
  assert.ok(q.minOut > 0 && q.outAmount >= q.minOut);
  assert.ok(Math.abs(q.rentSol - 0.00203928) < 1e-9);
  // …but a payout short by more than those costs is still refused
  reset();
  scenario.rate = 0.998;
  scenario.evil = 'sol-short';
  await rejects(quote('USDT', 'SOL', '1'), 'swap-unsafe');
  console.log('ok - into SOL with a new fee account: rent counted as a cost, a short payout still refused');
}

// 8. an empty fee wallet can't take a SOL fee below the rent minimum: refused with a clear reason
{
  reset();
  resetSwapCaches();
  chain[FEE.toBase58()] = walletAcc(0);
  await rejects(quote('SOL', 'USDC', '0.01'), 'swap-fee-wallet');
  assert.equal(sent.length, 0);
  chain[FEE.toBase58()] = walletAcc(830_000); // 0.00083 SOL + the 0.00007 SOL fee clears the minimum
  const q = await quote('SOL', 'USDC', '0.01');
  assert.ok(q.outAmount > 0);
  resetSwapCaches();
  chain[FEE.toBase58()] = walletAcc(0);
  const t = await quote('USDC', 'SOL', '5'); // token fees go to its token account: no SOL needed there
  assert.ok(t.outAmount > 0);
  console.log('ok - SOL fee into an empty fee wallet is refused up front, token fees unaffected');
}

console.log('swap: 8 tests passed');
