// Tiny translation layer. Russian and English live side by side in
// locales/strings.jsx; every other language has its own file with the same keys.
// A key missing from a language falls back to English.
import { STRINGS } from './locales/strings.jsx';
import es from './locales/es.jsx';
import fr from './locales/fr.jsx';
import de from './locales/de.jsx';
import pt from './locales/pt.jsx';
import zh from './locales/zh.jsx';
import ja from './locales/ja.jsx';
import { LANGS, HTML_LANG, detectLang as detect, localeFor, decimalSep, pluralIndex } from './lib/langs.js';

export { LANGS };
export const MORE = { es, fr, de, pt, zh, ja };

let lang = 'en';
let locale = 'en-US';
let decimal = '.';

/** Browser languages → one we speak. A saved preference other than 'auto' wins. */
export const detectLang = detect;

export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'en';
  locale = localeFor(lang);
  decimal = decimalSep(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lang];
}

export function getLang() {
  return lang;
}

export function intlLocale() {
  return locale;
}

/** True where people write 12,5 rather than 12.5. */
export function decimalComma() {
  return decimal === ',';
}

function lookup(key, l = lang) {
  const own = MORE[l];
  if (own && own[key] !== undefined) return own[key];
  const entry = STRINGS[key];
  if (!entry) return undefined;
  return entry[l] ?? entry.en;
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

export function t(key, vars = {}) {
  const v = lookup(key);
  if (v === undefined) {
    if (import.meta.env?.DEV) console.warn('i18n: missing key', key);
    return key;
  }
  if (typeof v === 'function') return v(vars);
  if (Array.isArray(v)) return fill(v[v.length - 1], vars);
  return fill(v, vars);
}

/** A counted phrase: tn('unit.days', 5) → "5 дней" / "5 days" / "5天". */
export function tn(key, n, vars = {}) {
  const v = lookup(key);
  if (v === undefined) return `${n}`;
  const forms = Array.isArray(v) ? v : [v];
  return fill(forms[pluralIndex(n, locale, forms.length)], { n, ...vars });
}

/** A word in every language we speak (for confirmation words typed by hand). */
export function inAllLangs(key) {
  return [...new Set(LANGS.map((l) => lookup(key, l)).filter((v) => typeof v === 'string'))];
}
