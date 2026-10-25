// Node checks for the wallet core: derivation, key import, vault, tx building.
import assert from 'node:assert/strict';
import { derivePath } from 'ed25519-hd-key';
import { mnemonicToSeedSync } from '@scure/bip39';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  keypairFromMnemonic,
  keypairFromPrivateKey,
  newMnemonic,
  isValidMnemonic,
  DERIVATION_PATHS,
  keypairFromSecret,
} from '../src/lib/keys.js';
import { encryptVault, decryptVault, passwordStrength } from '../src/lib/vault.js';
import { toBaseUnits, parseTx, isValidAddress, estimateFeeSol, parsePaymentText } from '../src/lib/solana.js';
import { parseAmount, fmtUsd, fmtToken, fmtDays, normalizeAmount, toInput, acceptAmountText, fmtTokenExact, floorTo, fmtDateLong } from '../src/lib/format.js';
import { goalProgress, goalSavedUsd, weeklyPace, savingPace, allocatedByToken, lockedByToken } from '../src/lib/goals-math.js';
import { setLang, t, tn, detectLang, inAllLangs, decimalComma } from '../src/i18n.js';

const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// 1. SLIP-10 derivation matches the reference library for every path we use
for (const path of DERIVATION_PATHS) {
  const ref = derivePath(path, Buffer.from(mnemonicToSeedSync(M)).toString('hex')).key;
  const ours = keypairFromMnemonic(M, path);
  assert.equal(ours.publicKey.toBase58(), Keypair.fromSeed(ref).publicKey.toBase58(), path);
}
const phantomAddr = keypairFromMnemonic(M).publicKey.toBase58();
console.log('abandon…about @ m/44\'/501\'/0\'/0\' ->', phantomAddr);
assert.equal(phantomAddr, 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');

// 2. New mnemonics are valid, 12 words
const fresh = newMnemonic();
assert.equal(fresh.split(' ').length, 12);
assert.ok(isValidMnemonic(fresh));
assert.ok(isValidMnemonic('  Abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ABOUT '));
assert.ok(!isValidMnemonic(M.replace('about', 'abandon')));

// 3. Private key import: base58 64, JSON array, 32-byte seed
const kp = Keypair.generate();
assert.equal(keypairFromPrivateKey(bs58.encode(kp.secretKey)).publicKey.toBase58(), kp.publicKey.toBase58());
assert.equal(keypairFromPrivateKey(JSON.stringify(Array.from(kp.secretKey))).publicKey.toBase58(), kp.publicKey.toBase58());
assert.equal(keypairFromPrivateKey(Array.from(kp.secretKey).join(', ')).publicKey.toBase58(), kp.publicKey.toBase58());
assert.equal(keypairFromPrivateKey(bs58.encode(kp.secretKey.slice(0, 32))).publicKey.toBase58(), kp.publicKey.toBase58());
assert.throws(() => keypairFromPrivateKey('not a key!!'), /format/);
assert.throws(() => keypairFromPrivateKey(bs58.encode(new Uint8Array(20))), /length/);
const tampered = Uint8Array.from(kp.secretKey);
tampered[40] ^= 1;
assert.throws(() => keypairFromPrivateKey(bs58.encode(tampered)));
assert.equal(
  keypairFromSecret({ type: 'privateKey', secretKey: bs58.encode(kp.secretKey) }).publicKey.toBase58(),
  kp.publicKey.toBase58(),
);
assert.equal(keypairFromSecret({ type: 'mnemonic', mnemonic: M }).publicKey.toBase58(), phantomAddr);

// 4. Vault round trip and wrong password
const vault = await encryptVault({ type: 'mnemonic', mnemonic: M }, 'Пароль-123');
assert.deepEqual(await decryptVault(vault, 'Пароль-123'), { type: 'mnemonic', mnemonic: M });
await assert.rejects(decryptVault(vault, 'wrong'), /bad-password/);
assert.equal(vault.iterations, 600000);
assert.ok(passwordStrength('Kopilka-2026!') >= 3);
assert.equal(passwordStrength('12345678'), 0);

// 5. Amount handling
assert.equal(toBaseUnits('1.5', 6), 1500000n);
assert.equal(toBaseUnits('0,000001', 6), 1n);
assert.equal(toBaseUnits(0.1 + 0.2, 6), 300000n);
assert.equal(toBaseUnits('12', 9), 12000000000n);
assert.equal(parseAmount('1 250,5'), 1250.5);
assert.ok(Number.isNaN(parseAmount('abc')));
setLang('ru');
assert.equal(fmtDays(21), '21 день');
assert.equal(fmtDays(12), '12 дней');
assert.equal(fmtDays(3), '3 дня');
assert.equal(toInput(12.5), '12,5');
assert.equal(t('home.total'), 'Всего в копилке');
console.log('ru:', fmtUsd(1245.3), '|', fmtToken(0.123456, 'SOL'), '|', fmtToken(1500.5, 'USDC'));
setLang('en');
assert.equal(fmtDays(1), '1 day');
assert.equal(fmtDays(5), '5 days');
assert.equal(toInput(12.5), '12.5');
assert.equal(t('home.total'), 'Total in piggy bank');
assert.equal(t('goals.savedOf', { saved: '$1', target: '$2' }), '$1 of $2');
assert.equal(normalizeAmount('1,250.50'), '1250.50');
assert.equal(normalizeAmount('1,250'), '1250');
assert.equal(normalizeAmount('12,5'), '12.5');
assert.equal(fmtUsd(1245.3), '$1,245.30');
// a tiny real amount never reads as zero
assert.equal(fmtToken(0.000001, 'SOL'), '<0.00001');
assert.equal(fmtToken(0.0001, 'USDT'), '<0.01');
assert.equal(fmtToken(-0.000001, 'SOL'), '−<0.00001');
assert.equal(fmtToken(0, 'SOL'), '0');
assert.equal(fmtToken(0.004, 'USDC'), '<0.01');
assert.equal(fmtToken(0.005, 'USDC'), '0.01');
console.log('en:', fmtUsd(1245.3), '|', fmtToken(0.123456, 'SOL'), '|', fmtToken(1500.5, 'USDC'));
setLang('ru');
assert.equal(normalizeAmount('1 250,5'), '1250.5');
assert.equal(normalizeAmount('1.250,5'), '1250.5');
assert.equal(normalizeAmount('abc'), null);
assert.equal(tn('unit.goals', 22), '22 цели');
assert.equal(tn('unit.daysLeft', 1), 'ещё 1 день');
assert.equal(tn('unit.daysLeft', 5), 'ещё 5 дней');

// 5a. The other six languages: words, plurals, numbers, the decimal comma
const sample = {
  es: { total: 'Total en la alcancía', d1: '1 día', d5: '5 días', left1: 'queda 1 día', comma: true, usd: '1245,30 $' },
  fr: { total: 'Total dans la tirelire', d1: '1 jour', d5: '5 jours', left1: 'encore 1 jour', comma: true, usd: '1 245,30 $' },
  de: { total: 'Insgesamt im Sparschwein', d1: '1 Tag', d5: '5 Tage', left1: 'noch 1 Tag', comma: true, usd: '1.245,30 $' },
  pt: { total: 'Total no cofrinho', d1: '1 dia', d5: '5 dias', left1: 'falta 1 dia', comma: true, usd: '$ 1.245,30' },
  zh: { total: '存钱罐总额', d1: '1 天', d5: '5 天', left1: '还剩 1 天', comma: false, usd: '$1,245.30' },
  ja: { total: '貯金箱の合計', d1: '1日', d5: '5日', left1: 'あと1日', comma: false, usd: '$1,245.30' },
};
for (const [l, x] of Object.entries(sample)) {
  setLang(l);
  assert.equal(t('home.total'), x.total, l);
  assert.equal(fmtDays(1), x.d1, l);
  assert.equal(fmtDays(5), x.d5, l);
  assert.equal(tn('unit.daysLeft', 1), x.left1, l);
  assert.equal(decimalComma(), x.comma, l);
  assert.equal(toInput(12.5), x.comma ? '12,5' : '12.5', l);
  assert.equal(normalizeAmount('12,5'), '12.5', l);
  assert.equal(fmtUsd(1245.3).replace(/\s/g, ' '), x.usd, l);
  assert.equal(t('goals.savedOf', { saved: 'A', target: 'B' }).includes('A'), true, l);
}
setLang('zh');
assert.equal(normalizeAmount('1,250'), '1250', 'dot-decimal languages read 1,250 as a thousand');
setLang('de');
assert.equal(normalizeAmount('1,250'), '1.250', 'comma-decimal languages read it as one and a quarter');
assert.equal(fmtDateLong('2027-04-18'), '18. April 2027');
setLang('ja');
assert.equal(fmtDateLong('2027-04-18'), '2027年4月18日');
setLang('fr');
assert.equal(t('q', { x: 'Vacances' }), '«\u00a0Vacances\u00a0»', 'French quotes with non-breaking spaces');
for (const w of ['удалить', 'delete', 'eliminar', 'supprimer', 'löschen', 'excluir', '删除', '削除']) {
  assert.ok(inAllLangs('reset.word').includes(w), w);
}
assert.equal(detectLang('ja'), 'ja');
assert.equal(detectLang('xx'), detectLang('auto'), 'an unknown saved language falls back to the browser');
setLang('ru');

// 5b. What the amount field lets through
setLang('ru');
assert.equal(acceptAmountText('12,5', 6), '12,5');
assert.equal(acceptAmountText('1 250,55', 6), '1 250,55');
assert.equal(acceptAmountText('0,1234567', 6), null, 'more decimals than USDC has');
assert.equal(acceptAmountText('0,123456789', 9), '0,123456789', 'SOL has 9');
assert.equal(acceptAmountText('1,2,3', 6), null, 'two decimal commas');
assert.equal(acceptAmountText('1.2.3', 6), null);
assert.equal(acceptAmountText('12abc', 6), '12', 'letters dropped');
assert.equal(acceptAmountText(',', 6), ',', 'a lone separator is a valid start');
assert.equal(acceptAmountText('', 6), '');
assert.equal(acceptAmountText('9999999999999', 6), null, 'absurdly large');
setLang('en');
assert.equal(acceptAmountText('1,250.50', 6), '1,250.50');
assert.equal(acceptAmountText('1.5', 6), '1.5');
setLang('ru');
// toInput never produces exponents or float noise
assert.equal(toInput(1e-7), '0,0000001');
assert.equal(toInput(0.1 + 0.2), '0,3');
assert.equal(toInput(100), '100');
assert.equal(toInput(floorTo(10.123456789, 6)), '10,123456');
assert.equal(normalizeAmount(toInput(1e-7)), '0.0000001');
// exact amounts show every digit the token has
assert.equal(fmtTokenExact(10.123456, 'USDC'), '10,123456');
assert.equal(fmtTokenExact(250, 'USDC'), '250');
assert.equal(fmtTokenExact(0.000000001, 'SOL'), '0,000000001');
assert.equal(fmtDateLong('2027-04-18'), '18 апреля 2027', 'no doubled full stop after "г."');

// 5c. Goals count stablecoins as dollars, SOL by price, locked money included
const prices = { SOL: 150, USDC: 1, USDT: 1 };
const g = {
  target: 100,
  allocations: { mainnet: { USDC: 40, USDT: 0, SOL: 0.2 } },
  locks: { mainnet: [{ token: 'USDC', amount: 30, status: 'locked' }, { token: 'USDT', amount: 5, status: 'withdrawn' }] },
};
assert.equal(goalSavedUsd(g, prices, 'mainnet'), 40 + 30 + 0.2 * 150);
assert.equal(goalProgress(g, prices, 'mainnet'), 1);
assert.equal(goalProgress(g, prices, 'devnet'), 0, 'networks are separate');
assert.deepEqual(allocatedByToken([g], 'mainnet'), { SOL: 0.2, USDC: 40, USDT: 0 });
assert.deepEqual(lockedByToken([g], 'mainnet'), { SOL: 0, USDC: 30, USDT: 0 });
assert.equal(weeklyPace({ target: 100, deadline: null }, prices, 'mainnet'), null);
// a month or closer: per day; further away: per week
const inDays = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const near = savingPace({ target: 2100, deadline: inDays(19), allocations: {} }, prices, 'mainnet');
assert.equal(near.per, 'day');
assert.ok(Math.abs(near.amount - 2100 / near.days) < 1e-9 && near.days >= 19 && near.days <= 20, near);
const far = savingPace({ target: 2100, deadline: inDays(90), allocations: {} }, prices, 'mainnet');
assert.equal(far.per, 'week');
assert.ok(Math.abs(far.amount - 2100 / (far.days / 7)) < 1e-9);
assert.equal(savingPace({ target: 2100, deadline: inDays(30), allocations: {} }, prices, 'mainnet').per, 'day', '"ещё 31 день" is still per day');
assert.equal(savingPace({ target: 2100, deadline: inDays(33), allocations: {} }, prices, 'mainnet').per, 'week');
assert.equal(savingPace({ target: 2100, deadline: inDays(-3), allocations: {} }, prices, 'mainnet'), null, 'deadline passed');
assert.equal(savingPace({ target: 100, deadline: inDays(10), allocations: { mainnet: { USDC: 100 } } }, prices, 'mainnet'), null, 'already reached');
assert.equal(goalProgress({ target: 100, allocations: { mainnet: { USDC: 100 } } }, prices, 'mainnet'), 1, '100 USDC fills a $100 goal');

// 6. Address validation
assert.ok(isValidAddress(phantomAddr));
assert.ok(!isValidAddress('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpq0'));
assert.ok(!isValidAddress('hello'));

// 6b. What the Paste button takes out of the clipboard
assert.deepEqual(parsePaymentText(`  ${phantomAddr}\n`, 'mainnet'), { address: phantomAddr });
assert.deepEqual(parsePaymentText(`Мой адрес: ${phantomAddr}, спасибо!`, 'mainnet'), { address: phantomAddr });
assert.deepEqual(parsePaymentText(`solana:${phantomAddr}?amount=1.25&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&label=Shop`, 'mainnet'), {
  address: phantomAddr,
  token: 'USDC',
  amount: '1.25',
});
assert.deepEqual(parsePaymentText(`solana:${phantomAddr}?amount=0.5`, 'mainnet'), { address: phantomAddr, token: 'SOL', amount: '0.5' });
assert.deepEqual(parsePaymentText(`solana:${phantomAddr}?amount=3&spl-token=So11111111111111111111111111111111111111112`, 'mainnet'), {
  address: phantomAddr,
}, 'unknown token: keep only the address');
assert.equal(parsePaymentText('hello world', 'mainnet'), null);
assert.equal(parsePaymentText('', 'mainnet'), null);

// 7. Fee estimates are small
assert.ok(estimateFeeSol({ token: 'USDC', needsAta: true }).fee < 0.00002);

// 8. History parser: incoming USDC from someone else
const other = Keypair.generate().publicKey.toBase58();
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const parsed = parseTx(
  {
    transaction: { message: { accountKeys: [{ pubkey: other }, { pubkey: 'ataA' }, { pubkey: 'ataB' }], instructions: [] } },
    meta: {
      fee: 5000,
      preBalances: [1e9, 2e6, 2e6],
      postBalances: [1e9 - 5000, 2e6, 2e6],
      preTokenBalances: [
        { accountIndex: 1, mint: USDC, owner: other, uiTokenAmount: { uiAmountString: '100' } },
        { accountIndex: 2, mint: USDC, owner: phantomAddr, uiTokenAmount: { uiAmountString: '5' } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: USDC, owner: other, uiTokenAmount: { uiAmountString: '75' } },
        { accountIndex: 2, mint: USDC, owner: phantomAddr, uiTokenAmount: { uiAmountString: '30' } },
      ],
    },
  },
  phantomAddr,
  { [USDC]: 'USDC' },
);
assert.deepEqual(parsed.changes, [{ token: 'USDC', delta: 25 }]);
assert.equal(parsed.counterparty, other);
// a lock: USDC leaves and SOL pays the storage deposit — the token movement comes first
const lockParsed = parseTx(
  {
    transaction: { message: { accountKeys: [{ pubkey: phantomAddr }, { pubkey: 'ata' }, { pubkey: 'escrow' }], instructions: [] } },
    meta: {
      fee: 15000,
      preBalances: [1e9, 2e6, 0],
      postBalances: [1e9 - 15000 - 4990320, 2e6, 2951040],
      preTokenBalances: [{ accountIndex: 1, mint: USDC, owner: phantomAddr, uiTokenAmount: { uiAmountString: '100' } }],
      postTokenBalances: [{ accountIndex: 1, mint: USDC, owner: phantomAddr, uiTokenAmount: { uiAmountString: '50' } }],
    },
  },
  phantomAddr,
  { [USDC]: 'USDC' },
);
assert.equal(lockParsed.changes[0].token, 'USDC');
assert.equal(lockParsed.changes[0].delta, -50);
assert.equal(lockParsed.changes[1].token, 'SOL');

// 9. A signed SOL transfer verifies with the derived key
const { SystemProgram } = await import('@solana/web3.js');
const signer = keypairFromMnemonic(M);
const tx = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: new PublicKey(other), lamports: toBaseUnits('0.01', 9) }),
);
tx.recentBlockhash = bs58.encode(new Uint8Array(32).fill(7));
tx.feePayer = signer.publicKey;
tx.sign(signer);
assert.ok(nacl.sign.detached.verify(tx.serializeMessage(), tx.signature, signer.publicKey.toBytes()));
assert.ok(tx.verifySignatures());

// 10. "Lock until reached": the money is held until the goal is reached once, then it stays free
{
  const { isProtected, withReached } = await import('../src/lib/goals-math.js');
  const prices = { SOL: 100, USDC: 1, USDT: 1 };
  const g0 = { id: 'g', target: 100, locked: true, allocations: { mainnet: { USDC: 60, USDT: 0, SOL: 0 } } };
  assert.equal(isProtected(g0, prices, 'mainnet'), true, 'held below the target');
  assert.equal(withReached(g0, prices, 'mainnet'), g0, 'nothing to note below the target');
  const full = withReached({ ...g0, allocations: { mainnet: { USDC: 60, USDT: 0, SOL: 0.4 } } }, prices, 'mainnet', 1234);
  assert.equal(full.reachedAt.mainnet, 1234, 'reached once SOL makes up the rest');
  assert.equal(isProtected(full, prices, 'mainnet'), false);
  assert.equal(isProtected(full, { ...prices, SOL: 50 }, 'mainnet'), false, 'a cheaper SOL does not lock it again');
  const partly = withReached({ ...full, allocations: { mainnet: { USDC: 10, USDT: 0, SOL: 0 } } }, prices, 'mainnet');
  assert.equal(isProtected(partly, prices, 'mainnet'), false, 'taking part out leaves the rest free');
  const empty = withReached({ ...full, allocations: { mainnet: { USDC: 0, USDT: 0, SOL: 0 } } }, prices, 'mainnet');
  assert.equal(empty.reachedAt.mainnet, null, 'an emptied goal starts a new round');
  assert.equal(isProtected({ ...empty, allocations: { mainnet: { USDC: 5, USDT: 0, SOL: 0 } } }, prices, 'mainnet'), true);
  assert.equal(isProtected(full, prices, 'devnet'), true, 'each network on its own');
  assert.equal(isProtected({ ...g0, locked: false }, prices, 'mainnet'), false, 'a goal without the lock is never held');
  assert.equal(isProtected({ ...g0, smart: { unlockAt: 1 } }, prices, 'mainnet'), false, 'smart goals are held by the contract instead');
}

console.log('All core checks passed');
