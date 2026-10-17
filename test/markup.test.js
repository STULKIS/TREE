import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDOM } from './helpers.js';

const REQUIRED = [
  'viewport', 'still', 'fallback-banner', 'retry-3d', 'details-open', 'species-list', 'panel', 'panel-body',
  'surprise', 'snapshot', 'export-open', 'help-open', 'wind-toggle', 'turntable-toggle', 'status',
  'hud-triangles', 'hud-leaves', 'hud-height', 'specimen-name', 'dlg-export', 'dlg-help', 'dlg-details', 'diag-text', 'diag-copy',
];

test('markup contract: every id the app binds exists exactly once', () => {
  const { window: { document } } = makeDOM();
  for (const id of REQUIRED) {
    assert.equal(document.querySelectorAll(`#${id}`).length, 1, `#${id}`);
  }
});

test('markup contract: landmarks, live region and skip link', () => {
  const { window: { document } } = makeDOM();
  assert.ok(document.querySelector('header.masthead'));
  assert.ok(document.querySelector('main.studio'));
  assert.ok(document.querySelector('footer.actionbar'));
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.getElementById('status').getAttribute('aria-live'), 'polite');
  assert.equal(document.querySelector('.skip-link').getAttribute('href'), '#viewport');
});

test('markup contract: toggles declare aria-pressed and modals are hidden until opened', () => {
  const { window: { document } } = makeDOM();
  for (const id of ['wind-toggle', 'turntable-toggle']) {
    assert.ok(['true', 'false'].includes(document.getElementById(id).getAttribute('aria-pressed')), id);
  }
  for (const id of ['dlg-export', 'dlg-help', 'dlg-details']) {
    const dlg = document.getElementById(id);
    assert.equal(dlg.getAttribute('role'), 'dialog');
    assert.ok(dlg.hasAttribute('hidden'));
    assert.ok(dlg.getAttribute('aria-labelledby'));
  }
});

test('markup contract: the fallback banner offers retry and details, and is dismissible', () => {
  const { window: { document } } = makeDOM();
  const banner = document.getElementById('fallback-banner');
  assert.ok(banner.hasAttribute('hidden'));
  assert.match(document.getElementById('retry-3d').textContent, /Retry 3D/);
  assert.match(document.getElementById('details-open').textContent, /Details/);
  assert.ok(document.getElementById('banner-dismiss').getAttribute('aria-label'));
});
