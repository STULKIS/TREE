import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from './helpers/dom.js';

const REQUIRED_IDS = [
  'app', 'stage', 'viewport', 'still-canvas', 'banner', 'banner-reason', 'retry-3d', 'details-3d', 'banner-dismiss',
  'species-rail', 'species-list', 'specimen', 'specimen-name', 'specimen-latin', 'specimen-seed',
  'hud', 'hud-triangles', 'hud-leaves', 'hud-height', 'hud-mode',
  'panel', 'params', 'seed', 'dice', 'reset', 'panel-toggle', 'panel-close',
  'wind', 'turntable', 'recenter', 'surprise', 'snapshot', 'export', 'share', 'help',
  'status', 'toasts', 'help-modal', 'export-modal', 'diagnostics-modal', 'diagnostics-text', 'copy-diagnostics',
  'export-glb', 'export-obj', 'export-json', 'export-png', 'import-json'
];

test('index.html exposes the markup contract the app relies on', () => {
  const doc = createDom().window.document;
  for (const id of REQUIRED_IDS) assert.ok(doc.getElementById(id), `#${id} missing`);
  assert.equal(doc.documentElement.lang, 'en');
  assert.ok(doc.querySelector('meta[name="viewport"]'));
  assert.ok(doc.querySelector('title').textContent.includes('Sapling'));
  assert.ok(doc.querySelector('h1').textContent.includes('Sapling'));
  assert.ok(doc.querySelector('main'));
  assert.ok(doc.querySelector('header[role="banner"]'));
  assert.ok(doc.querySelector('nav[aria-label="Species"]'));
  assert.ok(doc.querySelector('.skip-link'));
  assert.ok(doc.querySelector('script[type="module"][src="/src/main.js"]'));
  assert.ok(doc.querySelector('link[rel="stylesheet"][href="/src/styles.css"]'));
});

test('toggles, live region and dialogs carry the right ARIA', () => {
  const doc = createDom().window.document;
  assert.equal(doc.getElementById('wind').getAttribute('aria-pressed'), 'false');
  assert.equal(doc.getElementById('turntable').getAttribute('aria-pressed'), 'false');
  const status = doc.getElementById('status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('role'), 'status');
  for (const id of ['help-modal', 'export-modal', 'diagnostics-modal']) {
    const m = doc.getElementById(id);
    assert.ok(m.hidden);
    const dialog = m.querySelector('[role="dialog"]');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.ok(doc.getElementById(dialog.getAttribute('aria-labelledby')));
    assert.ok(m.querySelector('[data-close]'));
  }
  assert.ok(doc.getElementById('banner').hidden);
  assert.equal(doc.getElementById('panel-toggle').getAttribute('aria-controls'), 'panel');
  assert.equal(doc.getElementById('still-canvas').getAttribute('role'), 'img');
});
