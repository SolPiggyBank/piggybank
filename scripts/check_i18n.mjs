// Every t('key') used in the source must exist in Russian and English, and every
// other language file must have exactly the same keys with the same {placeholders},
// the same kind of value (text, counted forms, or a JSX function) and real text.
// Run with the JSX loader: node --import ./test/register-jsx.mjs scripts/check_i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(f) && !p.includes('locales')) files.push(p);
  }
})('src');
const used = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt[n]?\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\$\{/g)) used.add(m[1] + '*');
  for (const m of src.matchAll(/inAllLangs\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
}

const { STRINGS } = await import('../src/locales/strings.jsx');
const keys = Object.keys(STRINGS);
const problems = [];

for (const k of used) {
  if (k.endsWith('*')) {
    const prefix = k.slice(0, -1);
    if (!keys.some((d) => d.startsWith(prefix))) problems.push(`no key starts with ${prefix}`);
    continue;
  }
  const e = STRINGS[k];
  if (!e) problems.push(`missing key: ${k}`);
  else if (e.ru === undefined || e.en === undefined) problems.push(`${k}: needs ru and en`);
}

const kind = (v) => (typeof v === 'function' ? 'jsx' : Array.isArray(v) ? 'forms' : typeof v === 'string' ? 'text' : typeof v);
const holes = (v) => {
  const list = Array.isArray(v) ? v : [v];
  return [...new Set(list.flatMap((s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort().join(',');
};
// JSX entries take named vars: compare the destructured names in their source
const jsxVars = (fn) => [...(String(fn).match(/^\s*\(\s*\{([^}]*)\}/)?.[1] || '').matchAll(/\w+/g)].map((m) => m[0]).sort().join(',');

for (const lang of ['es', 'fr', 'de', 'pt', 'zh', 'ja']) {
  const dict = (await import(`../src/locales/${lang}.jsx`)).default;
  for (const k of keys) {
    const ref = STRINGS[k].en;
    const v = dict[k];
    if (v === undefined) {
      problems.push(`${lang}: missing ${k}`);
      continue;
    }
    if (kind(v) !== kind(ref)) {
      problems.push(`${lang}: ${k} is ${kind(v)}, English is ${kind(ref)}`);
      continue;
    }
    if (kind(v) === 'jsx') {
      if (jsxVars(v) !== jsxVars(ref)) problems.push(`${lang}: ${k} takes {${jsxVars(v)}}, English {${jsxVars(ref)}}`);
      continue;
    }
    if (holes(v) !== holes(ref)) problems.push(`${lang}: ${k} has {${holes(v)}}, English has {${holes(ref)}}`);
    const list = Array.isArray(v) ? v : [v];
    if (list.some((s) => !String(s).trim())) problems.push(`${lang}: ${k} is empty`);
    if (kind(v) === 'forms' && list.length > 2) problems.push(`${lang}: ${k} has ${list.length} forms (one/other at most)`);
    if (/[А-Яа-яЁё]/.test(list.join(' '))) problems.push(`${lang}: ${k} still has Cyrillic`);
  }
  for (const k of Object.keys(dict)) if (!STRINGS[k]) problems.push(`${lang}: extra key ${k}`);
}

console.log('used keys:', used.size, 'defined:', keys.length);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('i18n OK (8 languages)');
