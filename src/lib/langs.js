// The languages the piggy bank speaks and how each one writes numbers and dates.
// Shared by the popup and the background worker, so it has no UI imports.

export const LANGS = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];

/** Each language in its own words, for the language menu. */
export const NATIVE_NAMES = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  zh: '简体中文',
  ja: '日本語',
};

// Used when the browser doesn't name a region for the language.
const DEFAULT_LOCALE = { en: 'en-US', ru: 'ru-RU', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', zh: 'zh-CN', ja: 'ja-JP' };

// The text itself is Simplified Chinese and Brazilian Portuguese, whatever the region.
export const HTML_LANG = { en: 'en', ru: 'ru', es: 'es', fr: 'fr', de: 'de', pt: 'pt-BR', zh: 'zh-CN', ja: 'ja' };

/** The browser's languages, most preferred first (its own UI language leads). */
export function browserLanguages() {
  const list = [];
  try {
    const ui = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.();
    if (ui) list.push(ui);
  } catch {
    /* not in an extension */
  }
  if (typeof navigator !== 'undefined') list.push(...(navigator.languages || []), navigator.language);
  return list.filter(Boolean).map((l) => String(l).replace('_', '-'));
}

const baseOf = (l) => l.toLowerCase().split('-')[0];

/** A saved choice other than 'auto' wins; otherwise the first browser language we speak, else English. */
export function detectLang(pref) {
  if (pref && pref !== 'auto' && LANGS.includes(pref)) return pref;
  for (const l of browserLanguages()) {
    const base = baseOf(l);
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

/**
 * The locale for numbers and dates: the browser's own variant of the language
 * when it names one (es-MX writes 1,234.50, es-AR 1.234,50), the usual one otherwise.
 */
export function localeFor(lang) {
  for (const l of browserLanguages()) {
    if (baseOf(l) !== lang || !l.includes('-')) continue;
    try {
      if (Intl.NumberFormat.supportedLocalesOf([l]).length) return l;
    } catch {
      /* not a locale this browser knows */
    }
  }
  return DEFAULT_LOCALE[lang] || 'en-US';
}

/** "," or "." — how this locale writes the decimal point. */
export function decimalSep(locale) {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value || '.';
  } catch {
    return '.';
  }
}

/**
 * Which of a word's forms to use for n. Forms come as
 * [one, few, many] (Russian), [one, other] (most languages) or [other] (Chinese, Japanese).
 */
export function pluralIndex(n, locale, count) {
  if (count <= 1) return 0;
  let c = 'other';
  try {
    c = new Intl.PluralRules(locale).select(n);
  } catch {
    c = n === 1 ? 'one' : 'other';
  }
  if (count >= 3) return c === 'one' ? 0 : c === 'few' ? 1 : 2;
  return c === 'one' ? 0 : 1;
}
