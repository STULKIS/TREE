import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { makeParams } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';
import { renderStillPreview } from '../src/render/cpuPreview.js';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://studio.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

function recordingContext() {
  const calls = { fills: 0, gradients: 0, fillRects: 0, colors: new Set() };
  const gradient = { addColorStop() {} };
  const context = {
    calls,
    createLinearGradient() {
      calls.gradients += 1;
      return gradient;
    },
    createRadialGradient() {
      calls.gradients += 1;
      return gradient;
    },
    fillRect() {
      calls.fillRects += 1;
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    arc() {},
    fill() {
      calls.fills += 1;
      calls.colors.add(this.fillStyle);
    },
  };
  Object.defineProperty(context, 'fillStyle', {
    get() {
      return this._fillStyle || '#000';
    },
    set(value) {
      this._fillStyle = value;
    },
  });
  return context;
}

function fakeCanvas(context, { width = 700, height = 820 } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    parentElement: { clientWidth: width, clientHeight: height },
    toDataURL: () => 'data:image/png;base64,',
    getContext: () => context,
  };
  return canvas;
}

const params = makeParams('birch', 4815);
params.leaves.density *= 0.4;
const tree = generateTree(params);

test('a still preview is rasterised with shaded triangle fills', () => {
  const context = recordingContext();
  const canvas = fakeCanvas(context);
  const result = renderStillPreview(canvas, tree);

  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
  assert.ok(result.drawn > 500, `only ${result.drawn} triangles drawn`);
  assert.ok(result.drawn <= result.total);
  assert.ok(context.calls.fills > 100);
  assert.ok(context.calls.gradients >= 2, 'backdrop and vignette gradients');
  assert.ok(canvas.width > 0 && canvas.height > 0);
  assert.ok(canvas.width <= 700 * 2);
  assert.ok(Number.isFinite(result.ms));
  // colours are quantised so the fillStyle set stays small
  assert.ok(context.calls.colors.size < result.drawn * 0.75);
});

test('the software renderer respects its triangle budget', () => {
  const context = recordingContext();
  const canvas = fakeCanvas(context);
  const result = renderStillPreview(canvas, tree, { maxTriangles: 40 });
  assert.equal(result.ok, true);
  assert.ok(result.drawn <= 40, `drew ${result.drawn} triangles`);
  assert.equal(result.truncated, true);
});

test('tiny triangles are skipped and the image can be scaled up', () => {
  const context = recordingContext();
  const canvas = fakeCanvas(context, { width: 300, height: 300 });
  const result = renderStillPreview(canvas, tree, { minArea: 40 });
  assert.equal(result.ok, true);
  assert.ok(result.drawn < 100, 'large-area threshold should discard most foliage');
});

test('trees without foliage still render', () => {
  const bare = generateTree({ ...makeParams('oak', 9), leaves: { ...makeParams('oak', 9).leaves, style: 'none' } });
  const context = recordingContext();
  const result = renderStillPreview(fakeCanvas(context), bare);
  assert.equal(result.ok, true);
  assert.ok(result.drawn > 100);
});

test('missing Canvas 2D or missing tree fails softly', () => {
  assert.deepEqual(renderStillPreview(null, tree), { ok: false, reason: 'no-canvas' });
  assert.deepEqual(
    renderStillPreview({ getContext: () => null }, tree),
    { ok: false, reason: 'no-2d-context' },
  );
  const context = recordingContext();
  assert.deepEqual(
    renderStillPreview(fakeCanvas(context), { barkGeometry: null, bounds: new THREE.Box3() }),
    { ok: false, reason: 'no-tree' },
  );
});
