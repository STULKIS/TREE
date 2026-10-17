import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { bootApp, failProbe } from './helpers/dom.js';

const require = createRequire(import.meta.url);

async function runAxe(win) {
  const axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  win.eval(axeSource);
  const results = await win.axe.run(win.document, {
    rules: { 'color-contrast': { enabled: false } } // jsdom has no layout/colour computation
  });
  return results.violations;
}

test('axe-core finds no violations on boot (WebGL mode)', async () => {
  const { app, win } = await bootApp();
  const violations = await runAxe(win);
  assert.deepEqual(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), []);
  app.dispose();
});

test('axe-core finds no violations in software mode with the banner and dialogs', async () => {
  const { app, win, doc } = await bootApp({ probe: failProbe });
  doc.getElementById('details-3d').click();
  const violations = await runAxe(win);
  assert.deepEqual(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), []);
  app.dispose();
});

test('everything interactive is reachable by keyboard', async () => {
  const { app, doc } = await bootApp();
  const interactive = doc.querySelectorAll('button, input, select, a[href]');
  for (const el of interactive) {
    if (el.closest('[hidden]')) continue;
    assert.ok(!el.hasAttribute('tabindex') || Number(el.getAttribute('tabindex')) >= 0, `${el.id || el.className} removed from tab order`);
    const name = el.getAttribute('aria-label') || el.textContent.trim() || (el.id && doc.querySelector(`label[for="${el.id}"]`)?.textContent) || el.title;
    assert.ok(name, `${el.outerHTML.slice(0, 80)} has no accessible name`);
  }
  app.dispose();
});
