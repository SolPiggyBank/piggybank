import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { rpc, RpcError } from './rpc.js';
import { TOKENS, TOKEN_ORDER, ATA_RENT_SOL } from './config.js';

export function isValidAddress(text) {
  try {
    const pk = new PublicKey(text.trim());
    return pk.toBase58() === text.trim();
  } catch {
    return false;
  }
}

const BASE58_RUN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

/**
 * What a pasted text means for the send form: a bare address, an address
 * buried in a sentence, or a Solana Pay link ("solana:<address>?amount=1.5&spl-token=<mint>").
 * Returns { address, amount?, token? } or null when there is no address in it.
 */
export function parsePaymentText(text, network) {
  const s = String(text || '').trim();
  if (!s) return null;
  const pay = s.match(/^solana:([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?(.*))?$/);
  if (pay && isValidAddress(pay[1])) {
    const out = { address: pay[1] };
    const q = new URLSearchParams(pay[2] || '');
    const amount = q.get('amount');
    const mint = q.get('spl-token');
    const token = mint ? TOKEN_ORDER.find((k) => TOKENS[k].mint[network] === mint) : 'SOL';
    if (token) {
      out.token = token;
      if (amount && /^\d*\.?\d+$/.test(amount)) out.amount = amount;
    }
    return out;
  }
  for (const candidate of s.match(BASE58_RUN) || []) {
    if (isValidAddress(candidate)) return { address: candidate };
  }
  return null;
}

/** Decimal string -> integer base units, without float rounding errors. */
export function toBaseUnits(amount, decimals) {
  const s = typeof amount === 'number' ? amount.toFixed(decimals) : String(amount).replace(',', '.');
  if (!/^\d*\.?\d*$/.test(s)) throw new Error('amount');
  const [int = '0', frac = ''] = s.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(int || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

const CU_PRICE_MICROLAMPORTS = 50_000;

/**
 * Looks at the destination before sending: is it a wallet or a token
 * account, and does it already hold this token?
 */
export async function inspectRecipient(endpoints, network, token, to) {
  const toPk = new PublicKey(to);
  const info = await rpc(endpoints, 'getAccountInfo', [to, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  const acc = info?.value;
  if (token === 'SOL') {
    const isTokenAccount = acc?.data?.program === 'spl-token';
    return { kind: 'wallet', needsAta: false, warnTokenAccount: isTokenAccount };
  }
  const mint = TOKENS[token].mint[network];
  if (acc?.data?.program === 'spl-token' || acc?.data?.program === 'spl-token-2022') {
    const parsed = acc.data.parsed;
    if (parsed?.type === 'account') {
      if (parsed.info.mint !== mint) return { kind: 'error', reason: 'wrong-token-account' };
      return { kind: 'token-account', destination: to, needsAta: false };
    }
    return { kind: 'error', reason: 'not-wallet' };
  }
  if (!PublicKey.isOnCurve(toPk.toBytes())) {
    return { kind: 'error', reason: 'off-curve' };
  }
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), toPk);
  const ataInfo = await rpc(endpoints, 'getAccountInfo', [ata.toBase58(), { encoding: 'base64', commitment: 'confirmed' }]);
  return { kind: 'wallet', destination: ata.toBase58(), needsAta: !ataInfo?.value };
}

export function estimateFeeSol({ token, needsAta }) {
  const units = token === 'SOL' ? 5_000 : needsAta ? 100_000 : 40_000;
  const lamports = 5000 + Math.ceil((units * CU_PRICE_MICROLAMPORTS) / 1e6);
  return { fee: lamports / 1e9, rent: needsAta ? ATA_RENT_SOL : 0, units };
}

/** Builds, signs and broadcasts a transfer. Returns { signature, lastValidBlockHeight, raw }. */
export async function sendTransfer({ endpoints, network, keypair, token, to, amount, recipient, sourceAccounts }) {
  const owner = keypair.publicKey;
  const toPk = new PublicKey(to);
  const tx = new Transaction();
  const { units } = estimateFeeSol({ token, needsAta: recipient?.needsAta });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICROLAMPORTS }));

  if (token === 'SOL') {
    const lamports = toBaseUnits(amount, 9);
    tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: toPk, lamports }));
  } else {
    const meta = TOKENS[token];
    const mint = new PublicKey(meta.mint[network]);
    const raw = toBaseUnits(amount, meta.decimals);
    const source = (sourceAccounts || []).find((a) => BigInt(a.raw) >= raw);
    if (!source) throw new Error('source-insufficient');
    const destination = new PublicKey(recipient.destination);
    if (recipient.needsAta) {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, destination, toPk, mint));
    }
    tx.add(createTransferCheckedInstruction(new PublicKey(source.pubkey), mint, destination, owner, raw, meta.decimals));
  }

  const { value: bh } = await rpc(endpoints, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = owner;
  tx.sign(keypair);
  const raw = tx.serialize().toString('base64');
  const signature = await rpc(endpoints, 'sendTransaction', [
    raw,
    { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 0 },
  ]);
  return { signature, lastValidBlockHeight: bh.lastValidBlockHeight, raw };
}

/** Polls until the transaction is confirmed, re-broadcasting while it is pending. */
export async function confirmSignature(endpoints, signature, { raw, lastValidBlockHeight, timeoutMs = 90_000 } = {}) {
  const started = Date.now();
  let round = 0;
  while (Date.now() - started < timeoutMs) {
    const res = await rpc(endpoints, 'getSignatureStatuses', [[signature], { searchTransactionHistory: false }]).catch(
      () => null,
    );
    const st = res?.value?.[0];
    if (st) {
      if (st.err) throw new RpcError('transaction failed', 'tx-failed', st.err);
      if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return st;
    }
    round++;
    if (raw && round % 2 === 0) {
      rpc(endpoints, 'sendTransaction', [raw, { encoding: 'base64', skipPreflight: true, maxRetries: 0 }]).catch(
        () => {},
      );
    }
    if (lastValidBlockHeight && round % 4 === 0) {
      const height = await rpc(endpoints, 'getBlockHeight', [{ commitment: 'confirmed' }]).catch(() => 0);
      if (height > lastValidBlockHeight) {
        // The blockhash is dead, so the transaction can't land any more — but it
        // may have landed just before. Callers drop their records on "expired",
        // so make sure with a full history lookup first.
        const last = await rpc(endpoints, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }]).catch(
          () => undefined,
        );
        const fin = last?.value?.[0];
        if (fin?.err) throw new RpcError('transaction failed', 'tx-failed', fin.err);
        if (fin && (fin.confirmationStatus === 'confirmed' || fin.confirmationStatus === 'finalized')) return fin;
        // not found anywhere: it never landed. (No answer, or still "processed": keep waiting.)
        if (last !== undefined && !fin) throw new RpcError('blockhash expired', 'expired');
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new RpcError('confirmation timeout', 'timeout');
}

export async function getSignatureStatus(endpoints, signature) {
  const res = await rpc(endpoints, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
  return res?.value?.[0] || null;
}

export async function requestAirdrop(endpoints, owner, sol = 1) {
  return rpc(endpoints, 'requestAirdrop', [owner, Math.round(sol * 1e9), { commitment: 'confirmed' }]);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]).catch(() => null);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Recent incoming/outgoing transfers. Token transfers land on token
 * accounts, so we look up signatures for the wallet and each token account.
 */
export async function fetchHistory(endpoints, owner, network, balances, limit = 15) {
  const addresses = new Set([owner]);
  const mintToSym = {};
  for (const sym of TOKEN_ORDER) {
    const mint = TOKENS[sym].mint[network];
    if (!mint) continue;
    mintToSym[mint] = sym;
    addresses.add(getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner)).toBase58());
    for (const a of balances?.accounts?.[sym] || []) addresses.add(a.pubkey);
  }
  const lists = await mapLimit([...addresses], 3, (addr) =>
    rpc(endpoints, 'getSignaturesForAddress', [addr, { limit, commitment: 'confirmed' }]),
  );
  // A failed lookup is not "no transactions": if nothing could be read, say so.
  if (lists.every((l) => l == null)) throw new RpcError('history unavailable', 'network');
  const bySig = new Map();
  for (const list of lists) for (const s of list || []) if (!bySig.has(s.signature)) bySig.set(s.signature, s);
  const sigs = [...bySig.values()].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0)).slice(0, limit);

  const txs = await mapLimit(sigs, 3, (s) =>
    rpc(endpoints, 'getTransaction', [
      s.signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
    ]),
  );

  if (sigs.length && txs.every((tx) => tx == null)) throw new RpcError('history unavailable', 'network');
  const entries = [];
  sigs.forEach((s, i) => {
    const tx = txs[i];
    if (!tx) return;
    const entry = parseTx(tx, owner, mintToSym);
    if (entry.changes.length === 0) return;
    entries.push({ signature: s.signature, ts: (s.blockTime || tx.blockTime || 0) * 1000, err: !!s.err, ...entry });
  });
  return entries;
}

export function parseTx(tx, owner, mintToSym) {
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const meta = tx.meta || {};
  const changes = [];
  let counterparty = null;

  const idx = keys.indexOf(owner);
  if (idx >= 0 && meta.preBalances && meta.postBalances) {
    let delta = (meta.postBalances[idx] - meta.preBalances[idx]) / 1e9;
    if (idx === 0) delta += (meta.fee || 0) / 1e9; // ignore the fee itself
    if (Math.abs(delta) > 0.0000001) {
      // Rent paid for creating someone's token account is not a "transfer".
      const rentOnly = Math.abs(Math.abs(delta) - ATA_RENT_SOL) < 0.000001 && delta < 0;
      if (!rentOnly) changes.push({ token: 'SOL', delta });
    }
    const instrs = tx.transaction.message.instructions || [];
    for (const ins of instrs) {
      const p = ins.parsed;
      if (ins.program === 'system' && p?.type === 'transfer') {
        if (p.info.source === owner) counterparty = p.info.destination;
        else if (p.info.destination === owner) counterparty = p.info.source;
      }
    }
  }

  const tokenDelta = {};
  const ownersByMint = {};
  const collect = (list, sign) => {
    for (const b of list || []) {
      const sym = mintToSym[b.mint];
      if (!sym) continue;
      const amt = Number(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0) * sign;
      if (b.owner === owner) tokenDelta[sym] = (tokenDelta[sym] || 0) + amt;
      else {
        ownersByMint[sym] = ownersByMint[sym] || {};
        ownersByMint[sym][b.owner] = (ownersByMint[sym][b.owner] || 0) + amt;
      }
    }
  };
  collect(meta.preTokenBalances, -1);
  collect(meta.postTokenBalances, +1);
  for (const [sym, delta] of Object.entries(tokenDelta)) {
    if (Math.abs(delta) < 0.000001) continue;
    changes.push({ token: sym, delta });
    const others = ownersByMint[sym] || {};
    const other = Object.entries(others).find(([, d]) => Math.sign(d) === -Math.sign(delta) && Math.abs(d) > 0);
    if (other) counterparty = other[0];
  }
  // A token movement is what the person did; a SOL change next to it is rent or a refund.
  changes.sort((a, b) => (a.token === 'SOL') - (b.token === 'SOL'));
  return { changes, counterparty, fee: (meta.fee || 0) / 1e9 };
}
