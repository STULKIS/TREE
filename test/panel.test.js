import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { makeParams, presetParams } from '../src/generator/params.js';

const dom = new JSDOM('<!doctype html><div id="panel"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const { buildPanel } = await import('../src/ui/panel.js');

test('panel renders every control group and edits params in place', () => {
  const params = makeParams('oak', 4815);
  const preset = presetParams('oak');
  const container = document.getElementById('panel');
  let changes = 0;

  const controls = buildPanel({
    container,
    getParams: () => params,
    getPreset: () => preset,
    onChange: () => { changes += 1; },
    onResetChange: () => {},
  });

  const titles = [...container.querySelectorAll('.group-title')].map((node) => node.textContent);
  assert.deepEqual(titles, ['Trunk', 'Root flare', 'Branching', 'Foliage', 'Bark', 'Studio']);
  assert.ok(container.querySelectorAll('input[type="range"]').length >= 12);
  assert.ok(container.querySelectorAll('input[type="color"]').length === 5);

  // move the first slider (trunk height)
  const height = container.querySelector('input[type="range"]');
  height.value = '15';
  height.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(params.trunk.height, 15);
  assert.equal(changes, 1);

  // toggling leaf style to bare reports through the same change channel
  const bare = [...container.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Bare');
  bare.click();
  assert.equal(params.leaves.style, 'none');

  controls.applyPreset();
  assert.equal(controls.trunk.height.get(), params.trunk.height);
});

test('reset buttons restore a preset section without a rebuild', () => {
  const params = makeParams('pine', 1);
  const preset = presetParams('pine');
  const container = document.getElementById('panel');
  container.innerHTML = '';
  buildPanel({
    container,
    getParams: () => params,
    getPreset: () => preset,
    onChange: () => {},
    onResetChange: () => {},
  });
  params.branches.angle = 20;
  container.querySelectorAll('.group-reset')[2].click();
  assert.equal(params.branches.angle, preset.branches.angle);
});
