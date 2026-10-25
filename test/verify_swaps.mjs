// Decodes the swaps signed during the e2e run and checks each one does exactly
// what the screen promised: PiggyBank's 0.7 % to the fee wallet, the owner's
// signature only, our compute budget, and Jupiter's route after the fee.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PublicKey, VersionedTransaction, ComputeBudgetProgram, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import { ed25519 } from '@noble/curves/ed25519';

const FEE_WALLET = new PublicKey('D52FHmr9jZF7TQT26VpDoZcu77qtSWPmPGcb36c8ThmQ');
const JUP6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const MINTS = {
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
};
const FEE_BPS = 70; // PiggyBank's fee (src/lib/config.js SWAP.feeBps)
const swaps = JSON.parse(readFileSync(new URL('./swap_txs.json', import.meta.url)));
assert.ok(swaps.length >= 3, 'the e2e run made swaps');

for (const { raw, owner, from, to, inRaw, feeAccountNew } of swaps) {
  const tx = VersionedTransaction.deserialize(Buffer.from(raw, 'base64'));
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  const me = new PublicKey(owner);
  assert.equal(keys[0], owner, 'the owner pays');
  assert.equal(tx.message.header.numRequiredSignatures, 1, 'only the owner signs');
  assert.ok(ed25519.verify(tx.signatures[0], tx.message.serialize(), me.toBytes()), 'valid signature');
  const ixs = tx.message.compiledInstructions.map((c) => ({
    program: keys[c.programIdIndex],
    keys: c.accountKeyIndexes.map((i) => keys[i]),
    data: Buffer.from(c.data),
  }));
  const budget = ixs.filter((i) => i.program === ComputeBudgetProgram.programId.toBase58());
  assert.deepEqual(budget.map((i) => i.data[0]), [2, 3], 'our CU limit, then our CU price');
  assert.ok(budget[0].data.readUInt32LE(1) < 400_000, 'CU limit from the simulation, not the maximum');

  const fee = (BigInt(inRaw) * BigInt(FEE_BPS)) / 10_000n;
  const swapIdx = ixs.findIndex((i) => i.program === JUP6);
  assert.ok(swapIdx > 0, 'Jupiter route');
  if (from === 'SOL') {
    const t = ixs.find((i) => i.program === SystemProgram.programId.toBase58() && i.keys[1] === FEE_WALLET.toBase58());
    assert.ok(t, 'SOL fee transfer');
    assert.equal(t.keys[0], owner);
    assert.equal(t.data.readBigUInt64LE(4), fee, 'exactly 0.7 % in lamports');
    assert.ok(ixs.indexOf(t) < swapIdx, 'fee before the swap');
  } else {
    const mint = MINTS[from];
    const t = ixs.find((i) => i.program === TOKEN_PROGRAM_ID.toBase58() && i.data[0] === 12);
    assert.ok(t, 'token fee transfer');
    assert.equal(t.keys[0], getAssociatedTokenAddressSync(mint, me).toBase58(), 'from the owner');
    assert.equal(t.keys[1], mint.toBase58());
    assert.equal(t.keys[2], getAssociatedTokenAddressSync(mint, FEE_WALLET).toBase58(), 'into the fee wallet');
    assert.equal(t.keys[3], owner);
    assert.equal(t.data.readBigUInt64LE(1), fee, 'exactly 0.7 %');
    const create = ixs.find((i) => i.program === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() && i.keys[2] === FEE_WALLET.toBase58());
    assert.equal(!!create, !!feeAccountNew, 'the fee account is opened only when it is missing');
  }
  // nothing else leaves the owner: system transfers only into its own wSOL account, one token transfer (the fee)
  const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, me).toBase58();
  for (const i of ixs) {
    if (i.program === SystemProgram.programId.toBase58() && i.data.readUInt32LE(0) === 2) {
      assert.ok([FEE_WALLET.toBase58(), wsol].includes(i.keys[1]), 'SOL only to the fee wallet or the own wSOL account');
    }
  }
  assert.equal(ixs.filter((i) => i.program === TOKEN_PROGRAM_ID.toBase58() && [3, 12].includes(i.data[0])).length, from === 'SOL' ? 0 : 1);
  console.log(`swap OK: ${from}→${to}, fee ${Number(fee) / (from === 'SOL' ? 1e9 : 1e6)} ${from} to D52F…ThmQ${feeAccountNew ? ' (account opened)' : ''}`);
}
console.log('All swaps verified');
