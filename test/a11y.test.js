import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeDOM } from './helpers.js';
import { createApp } from '../src/app.js';
import { createGenerator } from '../src/generator/client.js';

const require = createRequire(import.meta.url);
const AXE_SRC = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function runAxe(win) {
  win.eval(AXE_SRC);
  const res = await win.axe.run(win.document, {
    // Layout-dependent rules cannot be evaluated in jsdom; everything else is enforced.
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return res.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
}

async function boot(webgl) {
  const dom = makeDOM({ hash: '#species=oak&seed=1', scripts: true });
  const win = dom.window;
  const app = createApp({
    doc: win.document,
    win,
    generator: createGenerator(),
    createStage: ({ canvas }) => ({ setMesh() {}, setWind() {}, setTurntable() {}, snapshot: () => '', dispose() {} }),
    probe: ({ createCanvas }) => (webgl
      ? { ok: true, canvas: createCanvas(), gl: {}, attempts: [] }
      : { ok: false, canvas: null, gl: null, attempts: [{ label: 'x', ok: false, error: 'no webgl' }] }),
    describe: () => ({ webgl2: webgl, webgl1: false, errors: [] }),
    download() {},
    random: () => 3,
    lowCore: false,
  });
  await app.ready;
  await app.idle();
  return { win, app };
}

test('axe: zero violations on boot in live 3D mode', async () => {
  const { win, app } = await boot(true);
  const violations = await runAxe(win);
  assert.equal(violations.length, 0, violations.join("\n"));
  app.destroy();
});

test('axe: zero violations on boot in software mode with the fallback banner', async () => {
  const { win, app } = await boot(false);
  const violations = await runAxe(win);
  assert.equal(violations.length, 0, violations.join("\n"));
  app.destroy();
});

test('axe: dialogs are clean when opened', async () => {
  const { win, app } = await boot(false);
  app.dialogs.export.open();
  const violations = await runAxe(win);
  assert.equal(violations.length, 0, violations.join("\n"));
  app.dialogs.export.close();
  app.destroy();
});

test('focus is trapped inside an open dialog and restored on Escape', async () => {
  const { win, app } = await boot(false);
  const doc = win.document;
  const opener = doc.getElementById('export-open');
  opener.focus();
  app.dialogs.export.open();
  const dlg = doc.getElementById('dlg-export');
  const focusables = [...dlg.querySelectorAll('button, input')].filter((n) => !n.hidden);
  const last = focusables.at(-1);
  last.focus();
  dlg.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(doc.activeElement, focusables[0], 'Tab wraps to the first control');
  dlg.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.dialogs.export.isOpen, false);
  assert.equal(doc.activeElement, opener, 'focus returns to the opener');
  app.destroy();
});
