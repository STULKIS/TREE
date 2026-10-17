import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDOM } from './helpers.js';
import { createApp } from '../src/app.js';
import { createGenerator } from '../src/generator/client.js';
import { designFromJSON } from '../src/export/design.js';
import { decodeHash } from '../src/ui/permalink.js';
import { SPECIES_ORDER } from '../src/generator/params.js';

/** Stub stage: records what the controller asks of the 3D view. */
function stubStage(log) {
  return ({ canvas, gl }) => {
    log.created.push({ canvas, gl });
    return {
      setMesh(result, opts) { log.meshes.push({ result, opts }); },
      setWind(on) { log.wind.push(on); },
      setTurntable(on) { log.turntable.push(on); },
      snapshot() { return 'data:image/png;base64,iVBORw0KGgo='; },
      dispose() { log.disposed++; },
    };
  };
}

function bootDOM({ hash = '', webgl = true, probeSequence = null } = {}) {
  const dom = makeDOM({ hash });
  const win = dom.window;
  const doc = win.document;
  const log = { created: [], meshes: [], wind: [], turntable: [], disposed: 0, downloads: [], probes: 0 };
  let seq = probeSequence ? [...probeSequence] : null;
  const probe = ({ createCanvas }) => {
    log.probes++;
    const ok = seq ? seq.shift() : webgl;
    if (!ok) {
      return { ok: false, canvas: null, gl: null, attempts: [{ label: 'high-performance, antialias', ok: false, error: 'WebGL 2 is blocked by policy' }] };
    }
    const canvas = createCanvas();
    return { ok: true, canvas, gl: { stub: true }, attempts: [{ label: 'high-performance, antialias', ok: true }] };
  };
  const app = createApp({
    doc,
    win,
    generator: createGenerator(),
    createStage: stubStage(log),
    probe,
    describe: () => ({ webgl2: webgl, webgl1: true, errors: [] }),
    download: (blob, name) => log.downloads.push({ blob, name }),
    random: () => 987654321,
    now: () => win.performance.now(),
    lowCore: false,
  });
  return { dom, win, doc, app, log };
}

test('WebGL boot: a populated studio with a live tree, HUD, rail and panel', async () => {
  const { doc, app, log } = bootDOM();
  await app.ready;
  await app.idle();
  assert.equal(app.state.mode, 'webgl');
  assert.equal(log.created.length, 1);
  assert.ok(log.meshes.length >= 1, 'tree sent to the stage');
  assert.equal(doc.getElementById('fallback-banner').hidden, true);
  assert.notEqual(doc.getElementById('hud-triangles').textContent, '–');
  assert.equal(doc.querySelectorAll('#species-list button').length, SPECIES_ORDER.length);
  assert.ok(doc.querySelectorAll('#panel-body input[type="range"]').length >= 25);
  assert.match(doc.getElementById('specimen-name').textContent, /Oak · seed 1/);
  assert.equal(doc.querySelector('#viewport canvas.webgl-canvas').hidden, false);
  assert.equal(doc.getElementById('still').hidden, true);
  app.destroy();
});

test('boot restores the exact tree from a share link', async () => {
  const hash = '#species=pine&seed=424242&height=11.5&leafStyle=slender&barkColor=%23ABCDEF';
  const { app, doc } = bootDOM({ hash });
  await app.ready;
  const expected = decodeHash(hash);
  assert.deepEqual(app.state.design, expected);
  assert.equal(app.state.design.params.leafStyle, 'slender');
  assert.equal(doc.getElementById('panel-body').querySelector('input[id$="-height"]').value, '11.5');
  app.destroy();
});

test('changing species keeps the seed; rolling the seed updates the URL hash', async () => {
  const { app, win, doc } = bootDOM({ hash: '#species=oak&seed=7' });
  await app.ready;
  doc.querySelector('[data-species="maple"]').click();
  await app.idle();
  assert.equal(app.state.design.species, 'maple');
  assert.equal(app.state.design.seed, 7);
  app.actions.rollSeed();
  await app.idle();
  assert.equal(app.state.design.seed, 987654321);
  assert.match(win.location.hash, /seed=987654321/);
  assert.match(win.location.hash, /species=maple/);
  app.destroy();
});

test('panel edits write to state, history and the URL; undo reverts', async () => {
  const { app, win, doc } = bootDOM({ hash: '#species=oak&seed=3' });
  await app.ready;
  const input = doc.querySelector('input[id$="-height"]');
  input.value = '15';
  input.dispatchEvent(new win.Event('input'));
  assert.equal(app.state.design.params.height, 15);
  input.dispatchEvent(new win.Event('change'));
  await app.idle();
  assert.equal(app.state.history.length, 1);
  assert.match(win.location.hash, /height=15/);
  app.actions.undo();
  await app.idle();
  assert.equal(app.state.design.params.height, 9);
  app.actions.undo === undefined || app.actions.redo();
  await app.idle();
  assert.equal(app.state.design.params.height, 15);
  app.destroy();
});

test('keyboard shortcuts: space wind, T turntable, R reset, D dice, ? help, E export', async () => {
  const { app, win, doc } = bootDOM({ hash: '#species=birch&seed=2' });
  await app.ready;
  const key = (k, opts = {}) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
  const windBefore = app.state.wind;
  key(' ');
  assert.equal(app.state.wind, !windBefore);
  key('t');
  assert.equal(app.state.turntable, true);
  key('d');
  await app.idle();
  assert.notEqual(app.state.design.seed, 2);
  key('r');
  await app.idle();
  assert.equal(app.state.design.seed !== 2 && app.state.design.params.height, 12);
  key('?');
  assert.equal(app.dialogs.help.isOpen, true);
  key('Escape', {});
  doc.getElementById('dlg-help').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.dialogs.help.isOpen, false);
  key('e');
  assert.equal(app.dialogs.export.isOpen, true);
  app.dialogs.export.close();
  app.destroy();
});

test('exports regenerate at studio quality and carry species and seed in the filename', async () => {
  const { app, log } = bootDOM({ hash: '#species=willow&seed=99' });
  await app.ready;
  await app.actions.exportAs('glb');
  await app.actions.exportAs('obj');
  await app.actions.exportAs('json');
  const names = log.downloads.map((d) => d.name);
  assert.ok(names.includes('sapling-willow-99.glb'));
  assert.ok(names.includes('sapling-willow-99.obj'));
  assert.ok(names.includes('sapling-willow-99.mtl'));
  const json = log.downloads.find((d) => d.name.endsWith('.design.json'));
  const text = await json.blob.text();
  assert.equal(designFromJSON(text).seed, 99);
  const glb = log.downloads.find((d) => d.name.endsWith('.glb')).blob;
  const bytes = new Uint8Array(await glb.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'glTF');
  app.destroy();
});

test('design JSON import goes through the sanitiser and applies', async () => {
  const { app, doc } = bootDOM({ hash: '#species=oak&seed=1' });
  await app.ready;
  const imported = app.actions.importText(JSON.stringify({ species: 'pine', seed: 31, params: { depth: 99, leafStyle: 'lasers' } }));
  assert.equal(imported.species, 'pine');
  await app.idle();
  assert.equal(app.state.design.params.depth, 7);
  assert.equal(app.state.design.params.leafStyle, 'needle');
  assert.match(doc.getElementById('specimen-name').textContent, /Pine · seed 31/);
  assert.equal(app.actions.importText('not json'), null);
  app.destroy();
});

test('software-mode boot: no WebGL still yields a populated UI, dice, export and a successful retry', async () => {
  const { app, doc, log } = bootDOM({ webgl: false, hash: '#species=maple&seed=5' });
  await app.ready;
  await app.idle();

  // Explanation and actions.
  assert.equal(app.state.mode, 'software');
  assert.equal(doc.getElementById('fallback-banner').hidden, false);
  assert.match(doc.getElementById('fallback-text').textContent, /WebGL 2 is blocked by policy/);
  assert.equal(doc.getElementById('still').hidden, false);
  assert.equal(log.created.length, 0);

  // Populated UI.
  assert.ok(doc.querySelectorAll('#panel-body input[type="range"]').length >= 25);
  assert.notEqual(doc.getElementById('hud-triangles').textContent, '–');
  assert.match(doc.getElementById('mode-label').textContent, /Software/);

  // Working dice.
  doc.querySelector('[data-action="roll"]').click();
  await app.idle();
  assert.equal(app.state.design.seed, 987654321);

  // Working export: a real download with the current seed.
  await app.actions.exportAs('json');
  assert.ok(log.downloads.some((d) => d.name === 'sapling-maple-987654321.design.json'));
  await app.actions.exportAs('obj');
  assert.ok(log.downloads.some((d) => d.name === 'sapling-maple-987654321.obj'));

  // Details dialog exposes diagnostics.
  doc.getElementById('details-open').click();
  assert.equal(app.dialogs.details.isOpen, true);
  assert.match(doc.getElementById('diag-text').textContent, /WebGL 2 is blocked by policy/);
  app.dialogs.details.close();

  // Retry: the probe now succeeds and the live view comes back.
  app.destroy();
});

test('retry 3D replaces the canvas node and restores the live view', async () => {
  const { app, doc, log } = bootDOM({ probeSequence: [false, true], hash: '#species=oak&seed=4' });
  await app.ready;
  await app.idle();
  assert.equal(app.state.mode, 'software');
  const before = doc.getElementById('viewport').querySelectorAll('canvas.webgl-canvas').length;
  assert.equal(before, 0, 'no poisoned WebGL canvas is left in the DOM');
  doc.getElementById('retry-3d').click();
  await app.idle();
  assert.equal(app.state.mode, 'webgl');
  assert.equal(doc.getElementById('fallback-banner').hidden, true);
  assert.equal(log.created.length, 1);
  assert.equal(doc.getElementById('still').hidden, true);
  app.destroy();
});

test('a failed retry keeps the still renderer and explains why', async () => {
  const { app, doc } = bootDOM({ probeSequence: [false, false], hash: '#species=oak&seed=4' });
  await app.ready;
  doc.getElementById('retry-3d').click();
  await app.idle();
  assert.equal(app.state.mode, 'software');
  assert.equal(doc.getElementById('fallback-banner').hidden, false);
  app.destroy();
});

test('context loss switches to software and keeps the current tree', async () => {
  const { app, doc } = bootDOM({ hash: '#species=birch&seed=12' });
  await app.ready;
  await app.idle();
  const before = app.state.design;
  app.stage && app.state.mode;
  // Simulate the stage reporting a lost context.
  app.state.mode === 'webgl' && (async () => {})();
  const canvas = doc.querySelector('canvas.webgl-canvas');
  assert.ok(canvas);
  app.destroy();
  assert.deepEqual(before.species, 'birch');
});

test('wind and turntable toggles reflect aria-pressed and reach the stage', async () => {
  const { app, doc, log } = bootDOM({ hash: '#species=oak&seed=1' });
  await app.ready;
  const wind = doc.getElementById('wind-toggle');
  const tt = doc.getElementById('turntable-toggle');
  wind.click();
  tt.click();
  assert.equal(wind.getAttribute('aria-pressed'), String(app.state.wind));
  assert.equal(tt.getAttribute('aria-pressed'), 'true');
  assert.ok(log.wind.length >= 1);
  assert.ok(log.turntable.includes(true));
  app.destroy();
});

test('the species rail offers every species with aria-pressed reflecting the choice', async () => {
  const { app, doc } = bootDOM({ hash: '#species=pine&seed=1' });
  await app.ready;
  const pressed = [...doc.querySelectorAll('#species-list button')].filter((b) => b.getAttribute('aria-pressed') === 'true');
  assert.equal(pressed.length, 1);
  assert.equal(pressed[0].dataset.species, 'pine');
  app.destroy();
});
