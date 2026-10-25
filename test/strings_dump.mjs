// Prints every language's interface text as JSON, for the Python browser tests.
// Counted forms give their last form; JSX entries give null.
import { STRINGS } from '../src/locales/strings.jsx';
const langs = ['ru', 'en', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];
const more = {};
for (const l of langs.slice(2)) more[l] = (await import(`../src/locales/${l}.jsx`)).default;
const flat = (v) => (typeof v === 'function' ? null : Array.isArray(v) ? v[v.length - 1] : v);
const out = {};
for (const l of langs) {
  out[l] = {};
  for (const [k, e] of Object.entries(STRINGS)) out[l][k] = flat(more[l]?.[k] ?? e[l] ?? e.en);
}
process.stdout.write(JSON.stringify(out));
