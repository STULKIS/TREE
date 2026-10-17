import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const indexHTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** A fresh jsdom document with Sapling's markup. Canvas 2D is absent, like most test hosts. */
export function makeDOM({ hash = '', url = 'http://localhost/', scripts = false } = {}) {
  const body = indexHTML.replace(/<script[\s\S]*?<\/script>/, '');
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(body, { url: url + hash, pretendToBeVisual: true, virtualConsole, ...(scripts ? { runScripts: 'outside-only' } : {}) });
  return dom;
}

/** Stub 2D-less canvas factory for probes. */
export function fakeCanvas(getContext) {
  return { getContext, width: 0, height: 0, classList: { add() {} }, remove() {} };
}
