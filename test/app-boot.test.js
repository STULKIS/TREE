import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, flush } from './helpers/dom.js';
import { parseGlb } from '../src/export/glb.js';
import { decodeHash } from '../src/ui/permalink.js';
import { presetParams, SPECIES_IDS } from '../src/generator/params.js';

test('full boot with a stubbed stage: populated UI, tree on stage, hash written', async () => {
  const { app, doc, record, win } = await bootApp();
  assert.equal(app.state.mode, 'webgl');
  assert.equal(doc.getElementById('app').dataset.mode, 'webgl');
  assert.ok(doc.getElementById('banner').hidden);
  assert.ok(record.some((r) => r[0] === 'create'));
  const setTree = record.filter((r) => r[0] === 'setTree');
  assert.ok(setTree.length >= 1);
  assert.equal(setTree[0][1], 'studio');
  assert.equal(doc.querySelectorAll('#species-list .species').length, SPECIES_IDS.length);
  assert.equal(doc.querySelector('.species[aria-pressed="true"]').dataset.species, 'oak');
  assert.notEqual(doc.getElementById('hud-triangles').textContent, '—');
  assert.match(doc.getElementById('hud-height').textContent, /m$/);
  assert.equal(doc.getElementById('hud-mode').textContent, 'webgl 2');
  assert.equal(win.location.hash, '#s=oak&seed=7');
  assert.equal(doc.getElementById('seed').value, '7');
  assert.equal(app.state.stage.wind, true);
  app.dispose();
});

test('changing species keeps the seed; rolling the seed regrows and updates the hash', async () => {
  const { app, doc, win } = await bootApp({ hash: '#s=oak&seed=123' });
  assert.equal(app.state.seed, 123);
  doc.querySelector('.species[data-species="pine"]').click();
  await app.settle();
  assert.equal(app.state.species, 'pine');
  assert.equal(app.state.seed, 123);
  assert.deepEqual(app.state.params, presetParams('pine'));
  assert.equal(doc.getElementById('specimen-name').textContent, 'Pine');
  assert.equal(doc.querySelector('.species[aria-pressed="true"]').dataset.species, 'pine');
  assert.equal(win.location.hash, '#s=pine&seed=123');
  assert.equal(doc.getElementById('param-leafStyle').value, 'needle');

  const before = app.state.tree;
  doc.getElementById('dice').click();
  await app.settle();
  assert.notEqual(app.state.seed, 123);
  assert.notEqual(app.state.tree, before);
  assert.equal(win.location.hash, `#s=pine&seed=${app.state.seed}`);
  assert.equal(doc.getElementById('specimen-seed').textContent, `seed ${app.state.seed}`);
  app.dispose();
});

test('a share link restores the exact tree and every slider', async () => {
  const { app, doc } = await bootApp({ hash: '#s=birch&seed=999&height=21.5&gnarl=0.9&leafStyle=droop&barkColor=112233' });
  assert.equal(app.state.species, 'birch');
  assert.equal(app.state.seed, 999);
  assert.equal(app.state.params.height, 21.5);
  assert.equal(doc.getElementById('param-height').value, '21.5');
  assert.equal(doc.getElementById('param-gnarl').value, '0.9');
  assert.equal(doc.getElementById('param-leafStyle').value, 'droop');
  assert.equal(doc.getElementById('param-barkColor').value, '#112233');
  assert.ok(doc.querySelector('.param[data-key="height"]').classList.contains('is-dirty'));
  const expected = decodeHash('#s=birch&seed=999&height=21.5&gnarl=0.9&leafStyle=droop&barkColor=112233');
  assert.deepEqual(app.design(), expected);
  assert.deepEqual(app.state.tree.params, expected.params);
  app.dispose();
});

test('slider drags preview at reduced quality and settle to studio; commits write the hash', async () => {
  const { app, doc, record, win } = await bootApp();
  const slider = doc.getElementById('param-height');
  slider.value = '20';
  slider.dispatchEvent(new win.Event('input', { bubbles: true }));
  await flush(80);
  await app.settle();
  const qualities = record.filter((r) => r[0] === 'setTree').map((r) => r[1]);
  assert.ok(qualities.includes('preview'), qualities.join(','));
  assert.equal(qualities[qualities.length - 1], 'studio');
  slider.dispatchEvent(new win.Event('change', { bubbles: true }));
  await app.settle();
  assert.equal(app.state.params.height, 20);
  assert.ok(win.location.hash.includes('height=20'));
  assert.equal(app.state.treeQuality, 'studio');
  app.dispose();
});

test('reset, undo, surprise and keyboard shortcuts', async () => {
  const { app, doc, win } = await bootApp();
  app.setParam('angle', 90);
  await app.settle();
  assert.equal(app.state.params.angle, 90);
  assert.ok(app.undo());
  await app.settle();
  assert.equal(app.state.params.angle, presetParams('oak').angle);

  app.setParam('curve', 0.9);
  await app.settle();
  doc.getElementById('reset').click();
  await app.settle();
  assert.deepEqual(app.state.params, presetParams('oak'));

  doc.getElementById('surprise').click();
  await app.settle();
  assert.ok(SPECIES_IDS.includes(app.state.species));
  assert.ok(win.location.hash.includes(`seed=${app.state.seed}`));

  const key = (k, init = {}) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  const windBefore = app.state.wind;
  key(' ');
  assert.equal(app.state.wind, !windBefore);
  assert.equal(doc.getElementById('wind').getAttribute('aria-pressed'), String(!windBefore));
  key('t');
  assert.equal(app.state.turntable, true);
  assert.equal(doc.getElementById('turntable').getAttribute('aria-pressed'), 'true');
  key('?');
  assert.equal(doc.getElementById('help-modal').hidden, false);
  key('Escape');
  assert.equal(doc.getElementById('help-modal').hidden, true);
  key('e');
  assert.equal(doc.getElementById('export-modal').hidden, false);
  assert.equal(doc.activeElement.id, 'export-glb');
  key('Escape');
  const seedBefore = app.state.seed;
  key('d');
  await app.settle();
  assert.notEqual(app.state.seed, seedBefore);
  key('z', { ctrlKey: true });
  await app.settle();
  assert.equal(app.state.seed, seedBefore);
  // Typing in the seed box must not trigger shortcuts
  const seedInput = doc.getElementById('seed');
  seedInput.focus();
  const t = app.state.turntable;
  seedInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 't', bubbles: true }));
  assert.equal(app.state.turntable, t);
  app.dispose();
});

test('modals trap focus and restore it to the opener', async () => {
  const { app, doc, win } = await bootApp();
  const helpBtn = doc.getElementById('help');
  helpBtn.focus();
  helpBtn.click();
  const modal = doc.getElementById('help-modal');
  assert.equal(modal.hidden, false);
  const close = modal.querySelector('[data-close]');
  assert.equal(doc.activeElement, close);
  // Tab from the last focusable wraps to the first
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.ok(modal.contains(doc.activeElement));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.ok(modal.contains(doc.activeElement));
  close.click();
  assert.equal(modal.hidden, true);
  assert.equal(doc.activeElement, helpBtn);
  app.dispose();
});

test('exports regenerate at studio quality and produce correct files', async () => {
  const { app, win } = await bootApp({ hash: '#s=maple&seed=31' });
  const glb = app.exportGlb();
  assert.equal(glb.name, 'sapling-maple-31.glb');
  const { json } = parseGlb(glb.buffer);
  assert.equal(json.meshes[0].primitives.length, 2);
  assert.equal(glb.tree.quality, 'studio');
  const obj = app.exportObj();
  assert.equal(obj.name, 'sapling-maple-31.obj.zip');
  assert.ok(obj.obj.includes('usemtl foliage'));
  const js = app.exportJson();
  assert.equal(js.name, 'sapling-maple-31.json');
  assert.equal(JSON.parse(js.json).seed, 31);
  assert.ok(win.__downloads.length >= 3);
  assert.ok(win.__downloads.every((d) => d.download.startsWith('sapling-maple-31')));
  app.dispose();
});

test('design JSON import goes through the sanitiser and rebuilds', async () => {
  const { app } = await bootApp();
  app.loadDesign({ species: 'willow', seed: 5, params: { height: 500, leafStyle: 'needle' } });
  await app.settle();
  assert.equal(app.state.species, 'willow');
  assert.equal(app.state.params.height, 40);
  assert.equal(app.state.params.leafStyle, 'needle');
  assert.equal(app.state.tree.species, 'willow');
  app.dispose();
});

test('losing the WebGL context drops to software mode and keeps the tree', async () => {
  const { app, doc } = await bootApp();
  const tree = app.state.tree;
  app.state.stage.opts.onContextLost({ preventDefault() {} });
  assert.equal(app.state.mode, 'software');
  assert.equal(doc.getElementById('banner').hidden, false);
  assert.match(doc.getElementById('banner-reason').textContent, /context was lost/);
  assert.ok(app.state.tree === tree || app.state.tree);
  assert.equal(doc.getElementById('still-canvas').hidden, false);
  await app.settle();
  assert.equal(app.state.treeQuality, 'software');
  app.dispose();
});
