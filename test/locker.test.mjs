// Offline checks for the Streamflow lock integration: the instruction we build
// must be a true time lock (no cancel, no transfer, no top-up, full cliff).
import assert from 'node:assert/strict';
import { Keypair, PublicKey, Connection, Transaction } from '@solana/web3.js';
import { MintLayout, TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { createHash } from 'node:crypto';
import { setConnectionFactory, buildLockInstructions, lockName, STREAMFLOW_PROGRAM } from '../src/lib/locker.js';

const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

function mintAccount() {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: 10n ** 12n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  return { data, owner: TOKEN_PROGRAM_ID, lamports: 1461600, executable: false, rentEpoch: 0 };
}

class FakeConnection extends Connection {
  constructor() {
    super('http://localhost:1');
  }
  async getAccountInfo(pk) {
    return pk.equals(USDC) ? mintAccount() : null;
  }
  async getMultipleAccountsInfo(pks) {
    return pks.map(() => ({ data: Buffer.alloc(AccountLayout.span), owner: TOKEN_PROGRAM_ID, lamports: 2039280, executable: false }));
  }
}
setConnectionFactory(() => new FakeConnection());

const owner = Keypair.generate();
const unlockAt = Math.floor(Date.now() / 1000) + 90 * 86400;
const { ixs, metadataId, metadata } = await buildLockInstructions({
  endpoints: ['https://fake'],
  network: 'mainnet',
  owner,
  token: 'USDC',
  amount: '125.5',
  unlockAt,
  name: lockName('Отпуск на море с семьёй и собакой — очень длинное название цели'),
});

const create = ixs.find((ix) => ix.programId.toBase58() === STREAMFLOW_PROGRAM.mainnet);
assert.ok(create, 'Streamflow create instruction present');
assert.ok(metadata, 'metadata keypair returned');
assert.equal(metadata.publicKey.toBase58(), metadataId);

// discriminator = sha256("global:create")[0..8]
const disc = createHash('sha256').update('global:create').digest().subarray(0, 8);
assert.deepEqual(create.data.subarray(0, 8), disc);

const d = create.data.subarray(8);
const u64 = (o) => d.readBigUInt64LE(o);
const start = u64(0);
const net = u64(8);
const period = u64(16);
const perPeriod = u64(24);
const cliff = u64(32);
const cliffAmount = u64(40);
const flags = [...d.subarray(48, 54)];
const name = Buffer.from(d.subarray(54, 118)).toString('utf8').replace(/\0+$/, '');

assert.equal(net, 125_500_000n, 'net amount in base units');
assert.equal(start, BigInt(unlockAt), 'start = unlock');
assert.equal(cliff, BigInt(unlockAt), 'cliff = unlock');
assert.equal(cliffAmount, 125_500_000n, 'everything unlocks at the cliff');
assert.equal(period, 1n);
assert.equal(perPeriod, 1n);
// cancelable_by_sender, cancelable_by_recipient, automatic_withdrawal,
// transferable_by_sender, transferable_by_recipient, can_topup
assert.deepEqual(flags, [0, 0, 0, 0, 0, 0], 'no cancel / transfer / auto-withdraw / top-up');
assert.ok(Buffer.byteLength(name) <= 64 && name.startsWith('Piggy: '), 'name fits 64 bytes');

// Accounts: sender signs, recipient is the same wallet, metadata signs, tokens come from the owner's ATA.
const keys = create.keys.map((k) => k.pubkey.toBase58());
assert.equal(keys[0], owner.publicKey.toBase58());
assert.equal(keys[2], owner.publicKey.toBase58(), 'recipient = owner');
assert.equal(keys[3], metadataId);
assert.equal(keys[1], getAssociatedTokenAddressSync(USDC, owner.publicKey).toBase58());
assert.ok(create.keys[0].isSigner && create.keys[3].isSigner);
assert.equal(keys[11], USDC.toBase58(), 'mint');

// The transaction fits and signs with both signers.
const tx = new Transaction().add(...ixs);
tx.recentBlockhash = '11111111111111111111111111111111';
tx.feePayer = owner.publicKey;
tx.sign(owner, metadata);
const size = tx.serialize().length;
assert.ok(size < 1232, `tx size ${size} fits`);
assert.ok(tx.verifySignatures());

// ---- withdraw after unlock -------------------------------------------------
import('../src/lib/locker.js');
const { buildWithdrawInstructions } = await import('../src/lib/locker.js');
const { decodeStream } = await import('@streamflow/stream');
const lockId = metadataId;
const escrow = PublicKey.findProgramAddressSync([Buffer.from('strm'), new PublicKey(lockId).toBuffer()], new PublicKey(STREAMFLOW_PROGRAM.mainnet))[0];
const ownerAta = getAssociatedTokenAddressSync(USDC, owner.publicKey);
function streamAccount() {
  const b = Buffer.alloc(1104);
  const put = (off, pk) => new PublicKey(pk).toBuffer().copy(b, off);
  put(49, owner.publicKey); // sender
  put(81, ownerAta); // sender tokens
  put(113, owner.publicKey); // recipient
  put(145, ownerAta); // recipient tokens
  put(177, USDC); // mint
  put(209, escrow); // escrow tokens
  put(241, '5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw'); // treasury
  put(325, owner.publicKey); // partner
  b.writeBigUInt64LE(BigInt(unlockAt), 409); // start
  b.writeBigUInt64LE(125_500_000n, 417); // net deposited
  b.writeBigUInt64LE(1n, 425);
  b.writeBigUInt64LE(1n, 433);
  b.writeBigUInt64LE(BigInt(unlockAt), 441); // cliff
  b.writeBigUInt64LE(125_500_000n, 449);
  return b;
}
const decoded = decodeStream(streamAccount());
assert.equal(decoded.recipient.toBase58(), owner.publicKey.toBase58());
assert.equal(decoded.cliff.toNumber(), unlockAt);
class StreamConnection extends FakeConnection {
  async getAccountInfo(pk, c) {
    if (pk.toBase58() === lockId) return { data: streamAccount(), owner: new PublicKey(STREAMFLOW_PROGRAM.mainnet), lamports: 1, executable: false };
    return super.getAccountInfo(pk, c);
  }
}
setConnectionFactory(() => new StreamConnection());
const wIxs = await buildWithdrawInstructions({ endpoints: ['https://fake'], network: 'mainnet', owner, id: lockId });
const w = wIxs.find((ix) => ix.programId.toBase58() === STREAMFLOW_PROGRAM.mainnet);
assert.ok(w, 'withdraw instruction present');
const signers = w.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58());
assert.deepEqual(signers, [owner.publicKey.toBase58()], 'only the owner signs a withdrawal');
const wKeys = w.keys.map((k) => k.pubkey.toBase58());
assert.ok(wKeys.includes(lockId) && wKeys.includes(escrow.toBase58()) && wKeys.includes(ownerAta.toBase58()));
console.log('withdraw ix accounts:', w.keys.length, 'signer:', signers[0].slice(0, 6));

console.log('lock name on chain:', JSON.stringify(name), `(${Buffer.byteLength(name)} bytes)`);
console.log('tx size:', size, 'bytes, instructions:', ixs.map((i) => i.programId.toBase58().slice(0, 6)).join(','));
console.log('Locker checks passed');
