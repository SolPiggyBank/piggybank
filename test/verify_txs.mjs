// Decodes the transactions the extension signed during the e2e run and checks
// that they do exactly what the UI promised.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Transaction, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const STREAMFLOW = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m';
const load = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const decode = (raw) => Transaction.from(Buffer.from(raw, 'base64'));

// 1. plain USDC transfer
{
  const { raw, owner, to, ata, amount } = load('./sent_tx.json');
  const tx = decode(raw);
  assert.ok(tx.verifySignatures());
  assert.equal(tx.feePayer.toBase58(), owner);
  const destAta = getAssociatedTokenAddressSync(USDC, new PublicKey(to)).toBase58();
  const create = tx.instructions.find((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.equal(create.data[0], 1, 'CreateIdempotent');
  const xfer = tx.instructions.find((i) => i.programId.equals(TOKEN_PROGRAM_ID));
  assert.equal(xfer.data[0], 12, 'TransferChecked');
  assert.equal(xfer.data.readBigUInt64LE(1), BigInt(amount));
  assert.equal(xfer.keys[0].pubkey.toBase58(), ata);
  assert.equal(xfer.keys[2].pubkey.toBase58(), destAta);
  console.log(`transfer OK: ${amount / 1e6} USDC → ${to.slice(0, 6)}…`);
}

// 2. Jupiter Lock: create a pure time lock for the owner
const JUP = new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn');
const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const jupIx = (tx, name) => tx.instructions.find((i) => i.programId.equals(JUP) && i.data.subarray(0, 8).equals(disc(name)));
{
  const { raw, owner, lockId, base, unlockAt, amount } = load('./lock_tx.json');
  const tx = decode(raw);
  assert.ok(tx.verifySignatures(), 'owner + escrow seed signatures valid');
  assert.equal(tx.feePayer.toBase58(), owner);
  assert.deepEqual(new Set(tx.signatures.map((s) => s.publicKey.toBase58())), new Set([owner, base]));
  const escrow = PublicKey.findProgramAddressSync([Buffer.from('escrow'), new PublicKey(base).toBuffer()], JUP)[0];
  assert.equal(escrow.toBase58(), lockId, 'lock id = escrow PDA of the seed key');
  const escrowToken = getAssociatedTokenAddressSync(USDC, escrow, true);
  const ataIx = tx.instructions.find((i) => i.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.ok(ataIx && ataIx.keys[1].pubkey.equals(escrowToken), 'escrow token account created first');
  const ix = jupIx(tx, 'create_vesting_escrow_v2');
  assert.ok(ix, 'create_vesting_escrow_v2 instruction');
  const u = (i) => ix.data.readBigUInt64LE(8 + i * 8);
  assert.equal(u(0), BigInt(unlockAt), 'vesting start = unlock date');
  assert.equal(u(1), BigInt(unlockAt), 'cliff = unlock date');
  assert.equal(u(3) + u(4) * u(5), BigInt(amount), 'locks exactly the amount');
  assert.ok(u(3) >= BigInt(amount) - 1n, 'all but one base unit open at the cliff');
  assert.deepEqual([ix.data[56], ix.data[57]], [0, 0], 'recipient change and cancel disabled');
  assert.equal(ix.keys[4].pubkey.toBase58(), owner, 'sender');
  assert.equal(ix.keys[6].pubkey.toBase58(), owner, 'recipient is the owner');
  assert.ok(ix.keys[3].pubkey.equals(escrowToken));
  assert.ok(ix.keys[5].pubkey.equals(getAssociatedTokenAddressSync(USDC, new PublicKey(owner))), 'paid from the owner');
  assert.ok(!tx.instructions.some((i) => i.programId.toBase58() === STREAMFLOW), 'no Streamflow');
  console.log(`lock OK: ${amount / 1e6} USDC in Jupiter Lock until ${new Date(unlockAt * 1000).toISOString().slice(0, 10)}, cancel/recipient change off`);
}

// 3. claim after the unlock date
{
  const { raw, owner, lockId } = load('./withdraw_tx.json');
  const tx = decode(raw);
  assert.ok(tx.verifySignatures());
  assert.equal(tx.signatures.length, 1, 'only the owner signs');
  const ix = jupIx(tx, 'claim_v2');
  assert.ok(ix, 'claim_v2 instruction');
  assert.equal(ix.keys[0].pubkey.toBase58(), lockId);
  assert.equal(ix.keys[3].pubkey.toBase58(), owner, 'recipient signs');
  assert.ok(ix.keys[4].pubkey.equals(getAssociatedTokenAddressSync(USDC, new PublicKey(owner))), 'tokens go to the owner');
  console.log('claim OK: signed by the owner only, tokens back to the owner');
}

// 4. closing the emptied escrow returns the storage deposit
{
  const { raw, owner, lockId } = load('./close_tx.json');
  const tx = decode(raw);
  assert.ok(tx.verifySignatures());
  assert.equal(tx.signatures.length, 1);
  const ix = jupIx(tx, 'close_vesting_escrow');
  assert.ok(ix, 'close_vesting_escrow instruction');
  assert.equal(ix.keys[0].pubkey.toBase58(), lockId);
  assert.equal(ix.keys[5].pubkey.toBase58(), owner, 'deposit returns to the owner');
  console.log('close OK: escrow closed by its creator');
}

// 5. a lock left from v1.1 still comes out through Streamflow
{
  const { raw, owner, lockId } = load('./withdraw_sf_tx.json');
  const tx = decode(raw);
  assert.ok(tx.verifySignatures());
  assert.equal(tx.signatures.length, 1, 'only the owner signs');
  const ix = tx.instructions.find((i) => i.programId.toBase58() === STREAMFLOW);
  assert.ok(ix, 'Streamflow withdraw instruction');
  assert.ok(ix.keys.some((k) => k.pubkey.toBase58() === lockId));
  assert.ok(ix.keys.filter((k) => k.isSigner).every((k) => k.pubkey.toBase58() === owner));
  console.log('legacy Streamflow withdraw OK');
}
console.log('All signed transactions verified');
