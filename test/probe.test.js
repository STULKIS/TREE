import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeWebGL, describeSupport, ATTRIBUTE_SETS } from '../src/render/webgl-probe.js';
import { collectDiagnostics } from '../src/render/diagnostics.js';

test('probe tries attribute sets in order and returns the first working context', () => {
  const seen = [];
  const createCanvas = () => ({
    getContext(kind, attrs) {
      seen.push({ kind, attrs });
      if (seen.length < 2) throw new Error('out of memory');
      return { isContextLost: () => false, name: 'gl2' };
    },
  });
  const res = probeWebGL({ createCanvas });
  assert.equal(res.ok, true);
  assert.equal(res.gl.name, 'gl2');
  assert.equal(res.attempts.length, 2);
  assert.equal(res.attempts[0].ok, false);
  assert.match(res.attempts[0].error, /out of memory/);
  assert.equal(seen[0].attrs.powerPreference, 'high-performance');
  assert.equal(seen[1].attrs.antialias, false);
  assert.equal(res.attrs, ATTRIBUTE_SETS[1].attrs);
});

test('a context that is already lost counts as a failure', () => {
  const res = probeWebGL({
    createCanvas: () => ({ getContext: () => ({ isContextLost: () => true }) }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.attempts.length, ATTRIBUTE_SETS.length);
  assert.ok(res.attempts.every((a) => /lost/.test(a.error)));
});

test('getContext returning null or throwing never escapes the probe', () => {
  const nullish = probeWebGL({ createCanvas: () => ({ getContext: () => null }) });
  assert.equal(nullish.ok, false);
  const throwing = probeWebGL({ createCanvas: () => ({ getContext() { throw new Error('SecurityError'); } }) });
  assert.equal(throwing.ok, false);
  assert.match(throwing.attempts[0].error, /SecurityError/);
});

test('every attempt uses a fresh canvas because failed canvases stay poisoned', () => {
  const made = [];
  probeWebGL({
    createCanvas: () => {
      const c = { getContext: () => null, id: made.length };
      made.push(c);
      return c;
    },
  });
  assert.equal(new Set(made).size, ATTRIBUTE_SETS.length);
});

test('describeSupport reports WebGL 1/2 availability and unmasked GPU strings', () => {
  const ext = { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
  const gl = {
    getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? ext : null),
    getParameter: (p) => (p === 1 ? 'ACME' : 'Turbo GPU 9000'),
  };
  const support = describeSupport({
    createCanvas: () => ({ getContext: (kind) => (kind === 'webgl2' ? gl : null) }),
  });
  assert.equal(support.webgl2, true);
  assert.equal(support.webgl1, false);
  assert.equal(support.unmaskedRenderer, 'Turbo GPU 9000');
});

test('diagnostics list browser facts, WebGL availability and every attempt', () => {
  const text = collectDiagnostics({
    win: { top: {}, self: {}, devicePixelRatio: 2, innerWidth: 1000, innerHeight: 700 },
    nav: { userAgent: 'UA/1', platform: 'Plat', language: 'en-US', hardwareConcurrency: 8 },
    screen: { width: 2560, height: 1440 },
    probe: { attempts: [{ label: 'high-performance', ok: false, error: 'no gpu' }] },
    support: { webgl2: false, webgl1: true, unmaskedRenderer: null, unmaskedVendor: null, errors: [] },
    reason: 'WebGL 2 is unavailable.',
  });
  for (const needle of ['UA/1', 'Plat', 'Cores: 8', 'WebGL 2 available: no', 'WebGL 1 available: yes', 'high-performance: failed (no gpu)', 'Device pixel ratio: 2', '2560×1440']) {
    assert.ok(text.includes(needle), `missing ${needle}`);
  }
});
