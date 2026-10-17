import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, failProbe, okProbe } from './helpers/dom.js';
import { parseGlb } from '../src/export/glb.js';

test('no WebGL still yields a populated, working studio with a still preview', async () => {
  const { app, doc, record } = await bootApp({ probe: failProbe });
  assert.equal(app.state.mode, 'software');
  assert.equal(doc.getElementById('app').dataset.mode, 'software');
  assert.ok(!record.some((r) => r[0] === 'create'), 'stage must not be created');
  const banner = doc.getElementById('banner');
  assert.equal(banner.hidden, false);
  assert.match(doc.getElementById('banner-reason').textContent, /refused every WebGL 2/);
  assert.ok(doc.getElementById('retry-3d'));
  assert.ok(doc.getElementById('details-3d'));
  const still = doc.getElementById('still-canvas');
  assert.equal(still.hidden, false);
  assert.ok(Number(still.dataset.triangles) > 500, `still drew ${still.dataset.triangles} triangles`);
  assert.ok(still.width >= 64 && still.height >= 64);
  assert.equal(app.state.treeQuality, 'software');
  assert.ok(app.state.tree.stats.triangles <= 60000);
  assert.notEqual(doc.getElementById('hud-triangles').textContent, '—');
  assert.equal(doc.getElementById('hud-mode').textContent, 'software');
  assert.equal(doc.querySelectorAll('#params .param').length > 30, true);
  assert.equal(doc.getElementById('turntable').disabled, true);
  app.dispose();
});

test('dice, sliders, share links and exports keep working in software mode', async () => {
  const { app, doc, win } = await bootApp({ probe: failProbe, hash: '#s=blossom&seed=4' });
  const before = app.state.tree;
  const trisBefore = doc.getElementById('still-canvas').dataset.triangles;
  doc.getElementById('dice').click();
  await app.settle();
  assert.notEqual(app.state.seed, 4);
  assert.notEqual(app.state.tree, before);
  assert.equal(win.location.hash, `#s=blossom&seed=${app.state.seed}`);
  assert.ok(Number(doc.getElementById('still-canvas').dataset.triangles) > 0);
  app.setParam('height', 5);
  await app.settle();
  assert.equal(app.state.params.height, 5);
  assert.ok(win.location.hash.includes('height=5'));
  assert.notEqual(doc.getElementById('still-canvas').dataset.triangles, undefined);
  void trisBefore;

  const glb = app.exportGlb();
  assert.equal(glb.tree.quality, 'studio', 'exports are full quality even in software mode');
  assert.ok(glb.tree.stats.triangles > app.state.tree.stats.triangles);
  const { json } = parseGlb(glb.buffer);
  assert.equal(json.meshes[0].primitives.length, 2);
  const obj = app.exportObj();
  assert.ok(obj.obj.startsWith('# Sapling'));
  const url = await app.share();
  assert.ok(url.includes('#s=blossom'));
  app.dispose();
});

test('details dialog lists diagnostics and the copy button works', async () => {
  const { app, doc, win } = await bootApp({ probe: failProbe });
  let copied = null;
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  doc.getElementById('details-3d').click();
  const modal = doc.getElementById('diagnostics-modal');
  assert.equal(modal.hidden, false);
  const text = doc.getElementById('diagnostics-text').textContent;
  for (const needle of ['Browser:', 'Platform:', 'In iframe:', 'Device pixel ratio:', 'Screen:', 'Logical cores:', 'WebGL 2:', 'WebGL 1:', 'GPU vendor:', 'GPU renderer:', 'Context attempts:', 'high-performance · antialias']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
  doc.getElementById('copy-diagnostics').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(copied, text);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(modal.hidden, true);
  app.dispose();
});

test('retry replaces the canvas, re-probes and restores 3D when WebGL comes back', async () => {
  let calls = 0;
  const probe = (createCanvas, opts) => {
    calls++;
    return calls === 1 ? failProbe() : okProbe(createCanvas, opts);
  };
  const { app, doc, record } = await bootApp({ probe });
  assert.equal(app.state.mode, 'software');
  const stageBefore = doc.getElementById('stage').innerHTML;
  const ok = await app.retry3D(doc.getElementById('retry-3d'));
  await app.settle();
  assert.equal(ok, true);
  assert.equal(calls, 2);
  assert.equal(app.state.mode, 'webgl');
  assert.equal(doc.getElementById('banner').hidden, true);
  assert.equal(doc.getElementById('still-canvas').hidden, true);
  assert.ok(record.some((r) => r[0] === 'create'));
  assert.notEqual(doc.getElementById('stage').innerHTML, stageBefore);
  assert.ok(doc.getElementById('stage').querySelector('canvas'));
  const last = record.filter((r) => r[0] === 'setTree').pop();
  assert.equal(last[1], 'studio');
  assert.equal(app.state.treeQuality, 'studio');
  app.dispose();
});

test('retry that fails again keeps software mode and explains why', async () => {
  const { app, doc } = await bootApp({ probe: failProbe });
  const ok = await app.retry3D();
  assert.equal(ok, false);
  assert.equal(app.state.mode, 'software');
  assert.equal(doc.getElementById('banner').hidden, false);
  assert.ok(doc.querySelector('.toast'));
  app.dispose();
});

test('a renderer constructor that throws also lands in software mode without throwing', async () => {
  const { app, doc } = await bootApp({
    createStage: () => {
      throw new Error('shader compile failed');
    }
  });
  assert.equal(app.state.mode, 'software');
  assert.match(doc.getElementById('banner-reason').textContent, /renderer failed to start/);
  assert.ok(app.state.tree);
  app.dispose();
});

test('the ?nogl flag forces software mode', async () => {
  const { app } = await bootApp({ forceSoftware: true });
  assert.equal(app.state.mode, 'software');
  assert.match(app.state.probe.reason, /nogl/);
  app.dispose();
});
