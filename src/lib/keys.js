import { Keypair } from '@solana/web3.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

// Derivation paths, in the order we try them when importing a seed phrase.
// The first one is what Phantom, Solflare and Backpack use.
export const DERIVATION_PATHS = ["m/44'/501'/0'/0'", "m/44'/501'/0'", "m/44'/501'"];
export const DEFAULT_PATH = DERIVATION_PATHS[0];

export function newMnemonic(strength = 128) {
  return generateMnemonic(wordlist, strength);
}

export function normalizeMnemonic(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function isValidMnemonic(text) {
  return validateMnemonic(normalizeMnemonic(text), wordlist);
}

export function isBip39Word(w) {
  return wordlist.includes(w);
}

export function suggestWords(prefix, limit = 4) {
  if (!prefix) return [];
  return wordlist.filter((w) => w.startsWith(prefix)).slice(0, limit);
}

// SLIP-0010 hardened derivation for ed25519.
function slip10Derive(path, seed) {
  const enc = new TextEncoder();
  let I = hmac(sha512, enc.encode('ed25519 seed'), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  const segments = path
    .split('/')
    .slice(1)
    .map((s) => {
      if (!s.endsWith("'")) throw new Error('ed25519 supports hardened paths only');
      return (parseInt(s, 10) + 0x80000000) >>> 0;
    });
  for (const index of segments) {
    const data = new Uint8Array(1 + 32 + 4);
    data[0] = 0;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export function keypairFromMnemonic(mnemonic, path = DEFAULT_PATH) {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic), '');
  return Keypair.fromSeed(slip10Derive(path, seed));
}

/**
 * Accepts the formats people actually have:
 *  - base58 string (Phantom / Solflare "export private key"), 64 or 32 bytes
 *  - JSON byte array from solana-keygen ([12,34,...])
 *  - comma/space separated byte list
 * Throws Error with a user-facing reason code.
 */
export function keypairFromPrivateKey(input) {
  const text = input.trim();
  if (!text) throw new Error('empty');
  let bytes;
  if (/^\[?\s*\d+(\s*[,\s]\s*\d+)+\s*\]?$/.test(text)) {
    const nums = text
      .replace(/[[\]]/g, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('format');
    bytes = Uint8Array.from(nums);
  } else {
    try {
      bytes = bs58.decode(text);
    } catch {
      throw new Error('format');
    }
  }
  if (bytes.length === 64) {
    const kp = Keypair.fromSecretKey(bytes); // validates the public half
    return kp;
  }
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error('length');
}

/** Rebuilds the keypair from the decrypted vault payload. */
export function keypairFromSecret(secret) {
  if (secret.type === 'mnemonic') return keypairFromMnemonic(secret.mnemonic, secret.path || DEFAULT_PATH);
  return Keypair.fromSecretKey(bs58.decode(secret.secretKey));
}

export function looksLikeMnemonic(text) {
  const words = normalizeMnemonic(text).split(' ');
  return words.length >= 12 && /^[a-z\s]+$/i.test(text.trim());
}
