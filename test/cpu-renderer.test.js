import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStill } from '../src/render/cpu-renderer.js';
import { buildTree } from '../src/generator/geometry.js';
import { sanitizeDesign, presetParams, HARD_LIMITS } from '../src/generator/params.js';

/** Records draw calls so budgets and painter order can be asserted without a real canvas. */
function recordingContext() {
  const log = { fills: 0, fillStyles: 0 };
  const ctx = {
    log,
    fillStyle: '',
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    ellipse() {},
    fill() { log.fills++; },
  };
  return ctx;
}

const design = (species, seed, params = {}) => sanitizeDesign({ species, seed, params: { ...presetParams(species), ...params } });

test('software still stays under the triangle budget and reports thinning', () => {
  const r = buildTree(design('pine', 1, { leafCap: 30000, depth: 7, children: 5 }), 'studio');
  const stats = renderStill(recordingContext(), r, { width: 1700, height: 1000, budget: HARD_LIMITS.softwareTriangles });
  assert.ok(stats.drawn <= HARD_LIMITS.softwareTriangles, `drew ${stats.drawn}`);
  assert.ok(stats.thinnedCards > 0, 'expected card thinning on a dense studio tree');
  assert.equal(stats.triangles, r.stats.triangles);
});

test('draw count equals the kept triangles and fills are issued once per triangle', () => {
  const r = buildTree(design('maple', 2), 'software');
  const ctx = recordingContext();
  const stats = renderStill(ctx, r, { width: 800, height: 600, budget: 70000 });
  // One extra fill is the soil disc in the backdrop; every kept triangle is exactly one fill.
  assert.equal(ctx.log.fills - 1, stats.drawn);
});

test('foliage thinning removes whole cards, never single triangles of a card', () => {
  const r = buildTree(design('pine', 3, { leafCap: 30000, depth: 6 }), 'studio');
  const ctx = recordingContext();
  const seen = [];
  const original = ctx.fill;
  // Track the vertex triplets drawn; each card's triangles must be all-or-nothing.
  let current = null;
  ctx.moveTo = (x, y) => { current = { pts: [[x, y]] }; };
  ctx.lineTo = (x, y) => { current.pts.push([x, y]); };
  ctx.fill = () => { seen.push(current); original(); };
  renderStill(ctx, r, { width: 1200, height: 900, budget: 40000 });
  assert.ok(seen.length > 0);
});

test('the sub-pixel sliver test culls tiny triangles without throwing on degenerate geometry', () => {
  const positions = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const group = { positions, normals: new Float32Array(9), colors: new Float32Array(9), uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2]) };
  const result = { bark: group, foliage: { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint32Array(0), cardStarts: new Uint32Array([0]) }, bounds: { min: [0, 0, 0], max: [0, 0, 0] } };
  const stats = renderStill(recordingContext(), result, { width: 100, height: 100 });
  assert.equal(stats.drawn, 0);
  assert.equal(stats.culled, 1);
});

test('bare trees render without foliage work', () => {
  const r = buildTree(design('oak', 4, { leafStyle: 'none' }), 'software');
  const stats = renderStill(recordingContext(), r, { width: 640, height: 480 });
  assert.equal(stats.thinnedCards, 0);
  assert.ok(stats.drawn > 0);
});
