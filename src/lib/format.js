import { intlLocale, getLang, decimalComma, t, tn } from '../i18n.js';

const cache = new Map();
function nf(key, opts) {
  const id = intlLocale() + key;
  if (!cache.has(id)) cache.set(id, new Intl.NumberFormat(intlLocale(), opts));
  return cache.get(id);
}

const nbsp = (s) => s.replace(/[  ]/g, ' ');

export function fmtUsd(n, { round = false } = {}) {
  if (n == null || Number.isNaN(n)) return '—';
  // narrowSymbol: a plain "$" in every language (not "US$" or "$US")
  const f = nf(round ? 'usd0' : 'usd', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: round ? 0 : 2 });
  return nbsp(f.format(n));
}

export function fmtToken(n, symbol) {
  if (n == null || Number.isNaN(n)) return '—';
  const digits = symbol === 'SOL' ? (Math.abs(n) < 1 ? 5 : 4) : 2;
  const f = nf('tok' + digits, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  // a real but tiny amount must not read as "0": show "<0.00001" instead
  const smallest = 10 ** -digits;
  if (n !== 0 && Math.abs(n) < smallest / 2) return `${n < 0 ? '−' : ''}<${nbsp(f.format(smallest))}`;
  return nbsp(f.format(n));
}

/** Fees in SOL: three decimals is enough to read ("0,101 SOL"). */
export function fmtSol(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const digits = n > 0 && n < 0.001 ? 6 : 3;
  return nbsp(nf('sol' + digits, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n));
}

export function fmtPct(n) {
  return nbsp(nf('pct', { maximumFractionDigits: 2 }).format(n));
}

/** Every significant digit the token has: what will actually move on chain. */
export function fmtTokenExact(n, symbol) {
  if (n == null || Number.isNaN(n)) return '—';
  const digits = symbol === 'SOL' ? 9 : 6;
  return nbsp(nf('exact' + digits, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n));
}

export function fmtTokenFull(n, symbol) {
  return `${fmtToken(n, symbol)} ${symbol}`;
}

/** Goal progress as people read it: "<1%" for a first coin, never "100%" before the goal is really reached. */
export function fmtProgress(p) {
  if (!(p > 0)) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.01) return '<1%';
  return `${Math.min(99, Math.floor(p * 100))}%`;
}

/** Width for a progress bar: a first coin still shows a sliver. */
export function barWidth(p) {
  if (!(p > 0)) return '0%';
  return `${Math.max(2.5, Math.min(100, p * 100))}%`;
}

export function shortAddr(a, n = 4) {
  if (!a) return '';
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}

export function daysLeft(deadline) {
  if (!deadline) return null;
  const end = new Date(deadline + 'T23:59:59');
  return Math.ceil((end - Date.now()) / 86400000);
}

export function fmtDays(n) {
  return tn('unit.days', n);
}

export function fmtDaysLeft(deadline) {
  const d = daysLeft(deadline);
  if (d == null) return '';
  if (d < 0) return t('days.passed');
  if (d === 0) return t('days.lastDay');
  return tn('unit.daysLeft', d);
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return t('date.today');
  if (d.toDateString() === y.toDateString()) return t('date.yesterday');
  return noYearMark(
    d.toLocaleDateString(intlLocale(), {
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    }),
  );
}

export function fmtDate(ts) {
  const label = dayLabel(ts);
  // Russian writes "сегодня, 14:30" in lower case; the others keep the word as it is
  return `${getLang() === 'ru' ? label.toLowerCase() : label}, ${fmtTime(ts)}`;
}

// Russian long dates end in "г." ("18 апреля 2027 г."), which doubles up with a
// sentence's own full stop; "18 апреля 2027" reads just as well.
const noYearMark = (s) => s.replace(/\s?г\.$/, '');

export function fmtDateLong(iso) {
  if (!iso) return '';
  return noYearMark(new Date(iso + 'T12:00:00').toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' }));
}

/**
 * A typed amount as a canonical decimal string ("1250.5"), or null.
 * Accepts "1 250,5", "1250.5", "1,250.50" and, where the decimal point is a dot, "1,250".
 */
export function normalizeAmount(text) {
  if (text == null) return null;
  let s = String(text).replace(/\s/g, '');
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // whichever separator comes last is the decimal one
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = !decimalComma() && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return null;
  return s;
}

/**
 * Accepts what a person would type for an amount ("12,5", "1 250.50", "1,250.5")
 * and refuses keystrokes that can't become one: a second decimal point or more
 * decimals than the token has.
 */
export function acceptAmountText(text, decimals = 9) {
  const v = text.replace(/[^\d.,\s]/g, '').replace(/^\s+/, '');
  if (v === '' || v === '.' || v === ',') return v;
  const norm = normalizeAmount(v);
  if (norm == null) return null;
  const frac = norm.split('.')[1] || '';
  if (frac.length > decimals) return null;
  if (norm.split('.')[0].replace(/^0+(?=\d)/, '').length > 12) return null;
  return v;
}

export function parseAmount(text) {
  const s = normalizeAmount(text);
  return s == null ? NaN : Number(s);
}

/** A number written the way the user types it in an input ("12,5" in Russian or German, "12.5" in English). */
export function toInput(n) {
  // toFixed avoids "1e-7" and float noise like 0.30000000000000004
  const s = typeof n === 'number' ? n.toFixed(9).replace(/\.?0+$/, '') : String(n);
  return decimalComma() ? s.replace('.', ',') : s;
}

/** Floor to the token's useful precision so "max" never overshoots. */
export function floorTo(n, decimals) {
  const f = 10 ** decimals;
  return Math.floor(n * f + 1e-9) / f;
}
