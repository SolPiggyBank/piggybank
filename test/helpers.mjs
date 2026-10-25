// Small CLI used by the Python e2e test for Solana-specific encoding.
import { PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';

const [cmd, ...args] = process.argv.slice(2);
const out = {};
if (cmd === 'keypair') {
  out.pubkey = Keypair.generate().publicKey.toBase58();
} else if (cmd === 'stream') {
  // stream <lockId> <owner> <mint> <amountRaw> <unlockAt> <program>
  const [id, owner, mint, amount, unlockAt, program] = args;
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner));
  const escrow = PublicKey.findProgramAddressSync([Buffer.from('strm'), new PublicKey(id).toBuffer()], new PublicKey(program))[0];
  const b = Buffer.alloc(1104);
  const put = (off, pk) => new PublicKey(pk).toBuffer().copy(b, off);
  put(49, owner);
  put(81, ata);
  put(113, owner);
  put(145, ata);
  put(177, mint);
  put(209, escrow);
  put(241, '5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw');
  put(325, owner);
  b.writeBigUInt64LE(BigInt(unlockAt), 409);
  b.writeBigUInt64LE(BigInt(amount), 417);
  b.writeBigUInt64LE(1n, 425);
  b.writeBigUInt64LE(1n, 433);
  b.writeBigUInt64LE(BigInt(unlockAt), 441);
  b.writeBigUInt64LE(BigInt(amount), 449);
  out.data = b.toString('base64');
  out.escrow = escrow.toBase58();
  out.ata = ata.toBase58();
} else if (cmd === 'ata') {
  // ata <owner> <mint> — an associated token address (off the ed25519 curve)
  out.address = getAssociatedTokenAddressSync(new PublicKey(args[1]), new PublicKey(args[0])).toBase58();
} else if (cmd === 'swapkeys') {
  // swapkeys <owner> <feeWallet> — the token accounts a swap touches
  const o = new PublicKey(args[0]);
  const f = new PublicKey(args[1]);
  const m = {
    USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
    SOL: new PublicKey('So11111111111111111111111111111111111111112'),
  };
  for (const k of ['USDC', 'USDT', 'SOL']) {
    out[k] = getAssociatedTokenAddressSync(m[k], o).toBase58();
    out['fee' + k] = getAssociatedTokenAddressSync(m[k], f).toBase58();
  }
} else if (cmd === 'secret') {
  // secret — a fresh keypair as base58 secret key and JSON array
  const kp = Keypair.generate();
  out.pubkey = kp.publicKey.toBase58();
  out.base58 = bs58.encode(kp.secretKey);
  out.json = JSON.stringify(Array.from(kp.secretKey));
} else if (cmd === 'escrowid') {
  // escrowid — a fresh seed key and the Jupiter Lock escrow address it gives
  const base = Keypair.generate().publicKey;
  out.base = base.toBase58();
  out.id = PublicKey.findProgramAddressSync([Buffer.from('escrow'), base.toBuffer()], new PublicKey('LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn'))[0].toBase58();
} else if (cmd === 'escrow') {
  // escrow <base> <owner> <mint> <totalRaw> <cliffTime> <claimedRaw> — a Jupiter Lock VestingEscrow account
  const [base, owner, mint, total, cliff, claimed = '0'] = args;
  const b = Buffer.alloc(296);
  Buffer.from([244, 119, 183, 4, 73, 116, 135, 195]).copy(b, 0);
  const put = (off, pk) => new PublicKey(pk).toBuffer().copy(b, off);
  put(8, owner); // recipient
  put(40, mint);
  put(72, owner); // creator
  put(104, base);
  b[136] = 255; // bump
  b.writeBigUInt64LE(BigInt(cliff), 144);
  b.writeBigUInt64LE(1n, 152); // frequency
  b.writeBigUInt64LE(BigInt(total) - 1n, 160); // cliff unlock amount
  b.writeBigUInt64LE(1n, 168); // amount per period
  b.writeBigUInt64LE(1n, 176); // number of periods
  b.writeBigUInt64LE(BigInt(claimed), 184);
  b.writeBigUInt64LE(BigInt(cliff), 192);
  out.data = b.toString('base64');
}
process.stdout.write(JSON.stringify(out));
