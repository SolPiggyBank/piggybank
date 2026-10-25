// Node loader hooks: compile .jsx on the fly so tests can import UI-adjacent modules.
import { transformWithOxc } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const file = fileURLToPath(url);
    const code = await readFile(file, 'utf8');
    const out = await transformWithOxc(code, file, { jsx: { runtime: 'automatic', importSource: 'preact' } });
    return { format: 'module', source: out.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
