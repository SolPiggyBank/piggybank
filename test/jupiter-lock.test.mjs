// Offline checks for the Jupiter Lock integration: the escrow we create must be
// a pure time lock owned by the user (no cancel, no recipient change, full
// cliff at the unlock date), and claim/close must be signed by the owner only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  JUP_LOCK_PROGRAM,
  DISCRIMINATORS,
  ESCROW_ACCOUNT_SIZE,
  createLockInstructions,
  claimInstructions,
  closeInstructions,
  decodeEscrow,
  escrowAddress,
  eventAuthority,
  lockSchedule,
} from '../src/lib/jupiter-lock.js';

const anchor = (s) => [...createHash('sha256').update(s).digest().subarray(0, 8)];
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('ok -', name);
};

test('program id and Anchor discriminators', () => {
  assert.equal(JUP_LOCK_PROGRAM.toBase58(), 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
  assert.deepEqual(DISCRIMINATORS.createVestingEscrowV2, anchor('global:create_vesting_escrow_v2'));
  assert.deepEqual(DISCRIMINATORS.claimV2, anchor('global:claim_v2'));
  assert.deepEqual(DISCRIMINATORS.closeVestingEscrow, anchor('global:close_vesting_escrow'));
  assert.deepEqual(DISCRIMINATORS.vestingEscrowAccount, anchor('account:VestingEscrow'));
  assert.equal(ESCROW_ACCOUNT_SIZE, 296);
});

test('schedule: everything opens at the unlock date, nothing before', () => {
  const p = lockSchedule(50_000_000n, 1_900_000_000);
  assert.equal(p.vestingStartTime, 1_900_000_000n);
  assert.equal(p.cliffTime, 1_900_000_000n);
  assert.equal(p.cliffUnlockAmount + p.amountPerPeriod * p.numberOfPeriod, 50_000_000n);
  assert.equal(p.frequency, 1n); // the last base unit follows one second after the cliff
  assert.equal(p.cancelMode, 0);
  assert.equal(p.updateRecipientMode, 0);
  assert.throws(() => lockSchedule(1n, 1), /amount-too-small/);
});

const owner = Keypair.generate().publicKey;
const base = Keypair.generate().publicKey;
const raw = 123_456_789n;
const unlockAt = 1_893_456_000;

test('create_vesting_escrow_v2: owner is sender and recipient, modes off', () => {
  const { escrow, escrowToken, ixs } = createLockInstructions({ owner, base, mint: USDC, raw, unlockAt });
  assert.ok(escrow.equals(PublicKey.findProgramAddressSync([Buffer.from('escrow'), base.toBuffer()], JUP_LOCK_PROGRAM)[0]));
  assert.ok(escrowToken.equals(getAssociatedTokenAddressSync(USDC, escrow, true)));
  const ata = ixs.find((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.equal(ata.data[0], 1, 'escrow token account created idempotently');
  assert.ok(ata.keys[1].pubkey.equals(escrowToken) && ata.keys[2].pubkey.equals(escrow));
  const ix = ixs.at(-1);
  assert.ok(ix.programId.equals(JUP_LOCK_PROGRAM));
  assert.equal(ix.data.length, 8 + 6 * 8 + 2 + 5);
  assert.deepEqual([...ix.data.subarray(0, 8)], DISCRIMINATORS.createVestingEscrowV2);
  const u = (i) => ix.data.readBigUInt64LE(8 + i * 8);
  assert.equal(u(0), BigInt(unlockAt), 'vesting start');
  assert.equal(u(1), BigInt(unlockAt), 'cliff');
  assert.equal(u(2), 1n, 'frequency');
  assert.equal(u(3) + u(4) * u(5), raw, 'locks exactly the amount');
  assert.deepEqual([...ix.data.subarray(56, 58)], [0, 0], 'no recipient change, no cancel');
  assert.deepEqual([...ix.data.subarray(58)], [1, 0, 0, 0, 0], 'remaining accounts: Some([])');
  const k = ix.keys.map((x) => x.pubkey.toBase58());
  assert.deepEqual(k, [
    base.toBase58(),
    escrow.toBase58(),
    USDC.toBase58(),
    escrowToken.toBase58(),
    owner.toBase58(),
    getAssociatedTokenAddressSync(USDC, owner).toBase58(),
    owner.toBase58(),
    TOKEN_PROGRAM_ID.toBase58(),
    SystemProgram.programId.toBase58(),
    eventAuthority().toBase58(),
    JUP_LOCK_PROGRAM.toBase58(),
  ]);
  assert.deepEqual(
    ix.keys.filter((x) => x.isSigner).map((x) => x.pubkey.toBase58()),
    [base.toBase58(), owner.toBase58()],
  );
  assert.equal(ix.keys[6].isWritable, false, 'recipient is read-only');
});

test('claim_v2: only the owner signs, money goes to the owner', () => {
  const escrow = escrowAddress(base);
  const ixs = claimInstructions({ owner, escrow, mint: USDC });
  const ix = ixs.at(-1);
  assert.deepEqual([...ix.data.subarray(0, 8)], DISCRIMINATORS.claimV2);
  assert.equal(ix.data.readBigUInt64LE(8), (1n << 64n) - 1n, 'claim everything unlocked');
  assert.ok(ix.keys[0].pubkey.equals(escrow));
  assert.ok(ix.keys[3].pubkey.equals(owner) && ix.keys[3].isSigner);
  assert.ok(ix.keys[4].pubkey.equals(getAssociatedTokenAddressSync(USDC, owner)));
  assert.equal(ix.keys[5].pubkey.toBase58(), MEMO);
  assert.deepEqual(
    ix.keys.filter((x) => x.isSigner).map((x) => x.pubkey.toBase58()),
    [owner.toBase58()],
  );
  const ata = ixs.find((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.equal(ata.data[0], 1, 'owner token account re-created idempotently if it was closed');
});

test('close_vesting_escrow: creator signs, no metadata account', () => {
  const escrow = escrowAddress(base);
  const ix = closeInstructions({ owner, escrow, mint: USDC }).at(-1);
  assert.deepEqual([...ix.data], [...DISCRIMINATORS.closeVestingEscrow, 1, 0, 0, 0, 0]);
  assert.ok(ix.keys[1].pubkey.equals(JUP_LOCK_PROGRAM) && !ix.keys[1].isWritable, 'optional metadata = none');
  assert.ok(ix.keys[5].pubkey.equals(owner) && ix.keys[5].isSigner);
  assert.equal(ix.keys.filter((x) => x.isSigner).length, 1);
});

test('VestingEscrow decoding (same bytes as the e2e helper)', () => {
  const out = JSON.parse(
    execFileSync('node', ['test/helpers.mjs', 'escrow', base.toBase58(), owner.toBase58(), USDC.toBase58(), String(raw), String(unlockAt), '1000']),
  );
  const e = decodeEscrow(out.data);
  assert.equal(e.recipient, owner.toBase58());
  assert.equal(e.creator, owner.toBase58());
  assert.equal(e.base, base.toBase58());
  assert.equal(e.tokenMint, USDC.toBase58());
  assert.equal(e.total, raw);
  assert.equal(e.totalClaimed, 1000n);
  assert.equal(e.cliffTime, unlockAt);
  assert.equal(e.cancelMode, 0);
  assert.equal(decodeEscrow(Buffer.alloc(296)), null, 'wrong discriminator is rejected');
});

console.log(`jupiter-lock: ${n} tests passed`);
