import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStill } from '../src/render/still.js';
import { generateTree } from '../src/generator/tree.js';

test('software still renders the real mesh within budget and time', () => {
  const tree = generateTree({ species: 'oak', seed: 1, params: {} }, 'software');
  const w = 1600;
  const h = 1062; // ≈1.7 MP
  renderStill(tree, { width: 320, height: 200 }); // warm up JIT
  const still = renderStill(tree, { width: w, height: h });
  assert.equal(still.width, w);
  assert.equal(still.data.length, w * h * 4);
  assert.ok(still.triangles <= 70000);
  assert.ok(still.triangles > 1000);
  assert.ok(still.ms < 1500, `took ${still.ms}ms`);
  // Image is populated: centre column has non-background pixels of varying colour
  const colours = new Set();
  for (let y = 0; y < h; y += 7) {
    const o = (y * w + (w >> 1)) * 4;
    colours.add(`${still.data[o]},${still.data[o + 1]},${still.data[o + 2]}`);
    assert.equal(still.data[o + 3], 255);
  }
  assert.ok(colours.size > 30);
});

test('over budget, leaf cards are thinned as whole fans', () => {
  const tree = generateTree({ species: 'willow', seed: 1, params: {} }, 'software');
  const tpc = tree.foliage.cardTriangles;
  const budget = Math.floor(tree.stats.triangles * 0.6);
  const still = renderStill(tree, { width: 640, height: 400, maxTriangles: budget });
  assert.ok(still.keepEvery > 1);
  assert.ok(still.triangles <= budget);
  // The thinning keeps whole cards: leaf triangles submitted are a multiple of triangles-per-card
  const leafTris = tree.foliage.indices.length / 3;
  const cards = leafTris / tpc;
  const keptCards = Math.ceil(cards / still.keepEvery);
  assert.ok(keptCards * tpc >= still.triangles - tree.bark.indices.length / 3 - 1);
  assert.ok(keptCards < cards);
});

test('empty foliage and tiny canvases do not crash', () => {
  const tree = generateTree({ species: 'birch', seed: 2, params: { leafStyle: 'none' } }, 'software');
  const still = renderStill(tree, { width: 8, height: 8 });
  assert.equal(still.data.length, 8 * 8 * 4);
  const still2 = renderStill({ bark: tree.bark, foliage: null, bounds: tree.bounds }, { width: 32, height: 16 });
  assert.ok(still2.triangles >= 0);
});
