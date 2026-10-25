// Password-based encryption of the wallet secret.
// PBKDF2-SHA256 (600 000 iterations) -> AES-256-GCM, all via WebCrypto.

const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts any JSON-serialisable payload with the password. */
export async function encryptVault(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  return {
    v: 1,
    kdf: 'pbkdf2-sha256',
    iterations: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(ct)),
  };
}

/** Returns the decrypted payload or throws Error('bad-password'). */
export async function decryptVault(vault, password) {
  try {
    const key = await deriveKey(password, fromB64(vault.salt), vault.iterations || ITERATIONS);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('bad-password');
  }
}

/** Rough password strength 0..4 for the meter. */
export function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zа-яё]/.test(pw) && /[A-ZА-ЯЁ]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\p{L}\d]/u.test(pw)) score++;
  if (/^(.)\1+$/.test(pw) || /^(12345|qwerty|password|йцукен)/i.test(pw)) score = 0;
  return Math.min(4, score);
}
