// On-chain time locks through Jupiter Lock (program audited by OtterSec and Sec3,
// no protocol fee). Instruction layouts follow the program's Anchor IDL as
// published in the Codama client of @heliofi/jup-lock-adapter; discriminators
// are the standard Anchor sha256("global:<name>")[0..8] and are checked in tests.
//
// A lock here is a vesting escrow where sender = recipient = the user, the
// cliff is the unlock time, the cliff releases everything but one base unit
// (which follows one second later), and cancel / recipient-change modes are
// "none". Before the cliff nobody can move the tokens; afterwards only the
// recipient can claim them.

import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { rpc } from './rpc.js';
import { TOKENS } from './config.js';

export const JUP_LOCK_PROGRAM = new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export const DISCRIMINATORS = {
  createVestingEscrowV2: [181, 155, 104, 183, 182, 128, 35, 47],
  claimV2: [229, 87, 46, 162, 21, 157, 231, 114],
  closeVestingEscrow: [221, 185, 95, 135, 136, 67, 252, 87],
  vestingEscrowAccount: [244, 119, 183, 4, 73, 116, 135, 195],
};

// discriminator 8 + 4 pubkeys + 4 flag bytes + 4 padding + 9 u64 + 5 u128
export const ESCROW_ACCOUNT_SIZE = 8 + 32 * 4 + 4 + 4 + 8 * 9 + 16 * 5;
const TOKEN_ACCOUNT_SIZE = 165;
const CU_PRICE_MICROLAMPORTS = 50_000;
// Generous limits: an exceeded limit fails in the RPC's preflight simulation, before any charge.
const CU_CREATE = 200_000;
const CU_CLAIM = 100_000;
const U64_MAX = (1n << 64n) - 1n;
// Option<RemainingAccountsInfo> = Some({ slices: [] }) — what production integrators send.
const EMPTY_REMAINING_ACCOUNTS = Buffer.from([1, 0, 0, 0, 0]);

const CANCEL_MODE_NONE = 0;
const UPDATE_RECIPIENT_NONE = 0;

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export function escrowAddress(base) {
  return PublicKey.findProgramAddressSync([Buffer.from('escrow'), base.toBuffer()], JUP_LOCK_PROGRAM)[0];
}

export function eventAuthority() {
  return PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], JUP_LOCK_PROGRAM)[0];
}

/** Schedule for a pure time lock of `raw` base units. */
export function lockSchedule(raw, unlockAt) {
  const amount = BigInt(raw);
  if (amount < 2n) throw new Error('amount-too-small');
  return {
    vestingStartTime: BigInt(unlockAt),
    cliffTime: BigInt(unlockAt),
    frequency: 1n,
    cliffUnlockAmount: amount - 1n,
    amountPerPeriod: 1n,
    numberOfPeriod: 1n,
    updateRecipientMode: UPDATE_RECIPIENT_NONE,
    cancelMode: CANCEL_MODE_NONE,
  };
}

/** Instructions creating a lock. `base` is a fresh keypair's public key that seeds the escrow address. */
export function createLockInstructions({ owner, base, mint, raw, unlockAt }) {
  const escrow = escrowAddress(base);
  const escrowToken = getAssociatedTokenAddressSync(mint, escrow, true);
  const senderToken = getAssociatedTokenAddressSync(mint, owner);
  const p = lockSchedule(raw, unlockAt);
  const data = Buffer.concat([
    Buffer.from(DISCRIMINATORS.createVestingEscrowV2),
    u64(p.vestingStartTime),
    u64(p.cliffTime),
    u64(p.frequency),
    u64(p.cliffUnlockAmount),
    u64(p.amountPerPeriod),
    u64(p.numberOfPeriod),
    Buffer.from([p.updateRecipientMode, p.cancelMode]),
    EMPTY_REMAINING_ACCOUNTS,
  ]);
  const create = new TransactionInstruction({
    programId: JUP_LOCK_PROGRAM,
    keys: [
      { pubkey: base, isSigner: true, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true }, // sender
      { pubkey: senderToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false }, // recipient = the same wallet
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(), isSigner: false, isWritable: false },
      { pubkey: JUP_LOCK_PROGRAM, isSigner: false, isWritable: false },
    ],
    data,
  });
  return {
    escrow,
    escrowToken,
    ixs: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU_CREATE }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICROLAMPORTS }),
      createAssociatedTokenAccountIdempotentInstruction(owner, escrowToken, escrow, mint),
      create,
    ],
  };
}

/** Instructions claiming everything unlocked back to the owner's token account. */
export function claimInstructions({ owner, escrow, mint }) {
  const escrowToken = getAssociatedTokenAddressSync(mint, escrow, true);
  const recipientToken = getAssociatedTokenAddressSync(mint, owner);
  const claim = new TransactionInstruction({
    programId: JUP_LOCK_PROGRAM,
    keys: [
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true }, // recipient
      { pubkey: recipientToken, isSigner: false, isWritable: true },
      { pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(), isSigner: false, isWritable: false },
      { pubkey: JUP_LOCK_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(DISCRIMINATORS.claimV2), u64(U64_MAX), EMPTY_REMAINING_ACCOUNTS]),
  });
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CU_CLAIM }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICROLAMPORTS }),
    createAssociatedTokenAccountIdempotentInstruction(owner, recipientToken, owner, mint),
    claim,
  ];
}

/** After a full claim: closes the escrow and returns its storage deposit to the creator. */
export function closeInstructions({ owner, escrow, mint }) {
  const escrowToken = getAssociatedTokenAddressSync(mint, escrow, true);
  const creatorToken = getAssociatedTokenAddressSync(mint, owner);
  const close = new TransactionInstruction({
    programId: JUP_LOCK_PROGRAM,
    keys: [
      { pubkey: escrow, isSigner: false, isWritable: true },
      // escrow_metadata is optional and we never create it: Anchor reads the program id as "none".
      { pubkey: JUP_LOCK_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: escrowToken, isSigner: false, isWritable: true },
      { pubkey: creatorToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true }, // creator
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: eventAuthority(), isSigner: false, isWritable: false },
      { pubkey: JUP_LOCK_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(DISCRIMINATORS.closeVestingEscrow), EMPTY_REMAINING_ACCOUNTS]),
  });
  return [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE_MICROLAMPORTS }), close];
}

/** Decodes a VestingEscrow account (base64 or Buffer). Returns null if it isn't one. */
export function decodeEscrow(data) {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
  if (b.length < 216) return null;
  if (!DISCRIMINATORS.vestingEscrowAccount.every((x, i) => b[i] === x)) return null;
  const pk = (o) => new PublicKey(b.subarray(o, o + 32)).toBase58();
  const n = (o) => b.readBigUInt64LE(o);
  const cliffUnlockAmount = n(160);
  const amountPerPeriod = n(168);
  const numberOfPeriod = n(176);
  return {
    recipient: pk(8),
    tokenMint: pk(40),
    creator: pk(72),
    base: pk(104),
    updateRecipientMode: b[137],
    cancelMode: b[138],
    cliffTime: Number(n(144)),
    frequency: n(152),
    cliffUnlockAmount,
    amountPerPeriod,
    numberOfPeriod,
    total: cliffUnlockAmount + amountPerPeriod * numberOfPeriod,
    totalClaimed: n(184),
    vestingStartTime: Number(n(192)),
    cancelledAt: Number(n(200)),
  };
}

const programChecked = new Map();
/** Makes sure the program is deployed on the selected network (it may be missing on devnet). */
export async function assertProgram(endpoints, network) {
  if (programChecked.get(network)) return;
  const info = await rpc(endpoints, 'getAccountInfo', [JUP_LOCK_PROGRAM.toBase58(), { encoding: 'base64' }]);
  if (!info?.value?.executable) throw new Error('lock-program-missing');
  programChecked.set(network, true);
}

/** Costs of one lock: no protocol fee, only the storage deposit and the network fee. */
export async function getLockQuote({ endpoints, network, token, amount }) {
  await assertProgram(endpoints, network);
  const [rentEscrow, rentToken] = await Promise.all([
    rpc(endpoints, 'getMinimumBalanceForRentExemption', [ESCROW_ACCOUNT_SIZE]),
    rpc(endpoints, 'getMinimumBalanceForRentExemption', [TOKEN_ACCOUNT_SIZE]),
  ]);
  const networkFeeLamports = 5000 * 2 + Math.ceil((CU_CREATE * CU_PRICE_MICROLAMPORTS) / 1e6);
  const amountNum = Number(amount);
  return {
    provider: 'jupiter',
    feePercent: 0,
    tokenFee: 0,
    totalToken: amountNum,
    creationFeeSol: 0,
    rentSol: (rentEscrow + rentToken) / 1e9,
    networkFeeSol: networkFeeLamports / 1e9,
    totalSol: (rentEscrow + rentToken + networkFeeLamports) / 1e9,
    decimals: TOKENS[token].decimals,
  };
}

async function signAndSend(endpoints, ixs, payer, signers) {
  const { value: bh } = await rpc(endpoints, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = new Transaction().add(...ixs);
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

/**
 * Creates the lock. The RPC simulates the transaction before sending it, so
 * anything the program wouldn't accept fails here without spending money.
 * The one-off `base` key only seeds the escrow address; it holds nothing and
 * has no authority over the lock afterwards.
 */
export async function createLock({ endpoints, network, keypair, token, raw, unlockAt }) {
  await assertProgram(endpoints, network);
  const mint = new PublicKey(TOKENS[token].mint[network]);
  const base = Keypair.generate();
  const { escrow, ixs } = createLockInstructions({ owner: keypair.publicKey, base: base.publicKey, mint, raw, unlockAt });
  const sent = await signAndSend(endpoints, ixs, keypair.publicKey, [keypair, base]);
  return { id: escrow.toBase58(), base: base.publicKey.toBase58(), ...sent };
}

export async function claimLock({ endpoints, network, keypair, id, token }) {
  const mint = new PublicKey(TOKENS[token].mint[network]);
  return signAndSend(endpoints, claimInstructions({ owner: keypair.publicKey, escrow: new PublicKey(id), mint }), keypair.publicKey, [keypair]);
}

export async function closeLock({ endpoints, network, keypair, id, token }) {
  const mint = new PublicKey(TOKENS[token].mint[network]);
  return signAndSend(endpoints, closeInstructions({ owner: keypair.publicKey, escrow: new PublicKey(id), mint }), keypair.publicKey, [keypair]);
}

/** On-chain state of a lock in token units, or null if the escrow account doesn't exist. */
export async function fetchLock({ endpoints, id, decimals }) {
  const info = await rpc(endpoints, 'getAccountInfo', [id, { encoding: 'base64', commitment: 'confirmed' }]);
  const acc = info?.value;
  if (!acc) return null;
  if (acc.owner !== JUP_LOCK_PROGRAM.toBase58()) throw new Error('not-a-lock');
  const e = decodeEscrow(acc.data[0]);
  if (!e) throw new Error('not-a-lock');
  const total = Number(e.total) / 10 ** decimals;
  const claimed = Number(e.totalClaimed) / 10 ** decimals;
  return {
    deposited: total,
    withdrawn: claimed,
    remaining: Math.max(0, total - claimed),
    unlockAt: e.cliffTime,
    closed: false,
    canceled: e.cancelledAt > 0,
    recipient: e.recipient,
    mint: e.tokenMint,
    cancelable: e.cancelMode !== CANCEL_MODE_NONE || e.updateRecipientMode !== UPDATE_RECIPIENT_NONE,
  };
}
