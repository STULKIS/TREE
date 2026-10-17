import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, makeParams, presetParams, deepMerge } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';

const palette = { trunk: '#000', leaves: '#000' };

test('every species generates finite geometry with leaves', () => {
  for (const species of SPECIES) {
    const tree = generateTree(makeParams(species.id, 1234));
    assert.ok(tree.stats.triangles > 500, `${species.id} needs geometry`);
    assert.ok(tree.stats.leaves > 100, `${species.id} needs foliage`);
    const position = tree.barkGeometry.getAttribute('position').array;
    for (let i = 0; i < position.length; i += 1) {
      assert.ok(Number.isFinite(position[i]), `${species.id} bark has a non-finite vertex`);
    }
    const leaves = tree.leafGeometry.getAttribute('position').array;
    for (let i = 0; i < leaves.length; i += 1) {
      assert.ok(Number.isFinite(leaves[i]), `${species.id} foliage has a non-finite vertex`);
    }
    assert.ok(tree.stats.height > 1, `${species.id} should be at least a metre tall`);
  }
});

test('the same seed and parameters always grow the same tree', () => {
  const params = makeParams('oak', 7777);
  const a = generateTree(params);
  const b = generateTree(params);
  assert.equal(a.stats.triangles, b.stats.triangles);
  assert.equal(a.stats.leaves, b.stats.leaves);
  const pa = a.barkGeometry.getAttribute('position').array;
  const pb = b.barkGeometry.getAttribute('position').array;
  assert.deepEqual(Array.from(pa.slice(0, 300)), Array.from(pb.slice(0, 300)));
});

test('different seeds produce different trees', () => {
  const a = generateTree(makeParams('oak', 111));
  const b = generateTree(makeParams('oak', 222));
  const pa = a.barkGeometry.getAttribute('position').array;
  const pb = b.barkGeometry.getAttribute('position').array;
  assert.notDeepEqual(Array.from(pa.slice(0, 300)), Array.from(pb.slice(0, 300)));
});

test('bare style removes foliage but keeps the skeleton', () => {
  const params = makeParams('maple', 90);
  params.leaves.style = 'none';
  const tree = generateTree(params);
  assert.equal(tree.leafGeometry, null);
  assert.equal(tree.stats.leaves, 0);
  assert.ok(tree.stats.triangles > 500);
});

test('no geometry reaches below the ground plane', () => {
  for (const species of ['willow', 'oak', 'blossom']) {
    const tree = generateTree(makeParams(species, 4242));
    assert.ok(tree.bounds.min.y > -0.25, `${species} dips too far below the soil`);
  }
});

test('presets stay stable and deepMerge does not mutate its inputs', () => {
  const base = { a: { b: 1 }, keep: true };
  const out = deepMerge(base, { a: { c: 2 } });
  assert.deepEqual(base, { a: { b: 1 }, keep: true });
  assert.deepEqual(out, { a: { b: 1, c: 2 }, keep: true });
  const preset = presetParams('pine');
  assert.notEqual(preset, presetParams('pine'));
  assert.equal(palette.trunk, '#000');
});

test('saved design parameters are sanitised before they reach the generator', async () => {
  const { sanitizeParams, presetParams } = await import('../src/generator/params.js');
  const weird = {
    species: 'oak',
    seed: 12,
    trunk: { height: 1e9, radius: -4, sides: 2.4, segments: 'lots' },
    roots: { count: 50, reach: 99 },
    branches: { levels: 1e6, depth: 999, angle: 'nope', split: 0, taper: 4 },
    leaves: { style: 'neon', density: 100, size: -1, colorA: 'chartreuse', wind: 1e9 },
    bark: { lumpiness: 9, roughness: -1, colorB: '#123456' },
  };
  const clean = sanitizeParams(weird, presetParams('oak'));
  assert.equal(clean.trunk.height, 24);
  assert.equal(clean.trunk.radius, 0.03);
  assert.equal(clean.trunk.sides, 5);
  assert.equal(clean.trunk.segments, 30);
  assert.equal(clean.roots.count, 9);
  assert.equal(clean.roots.reach, 3);
  assert.equal(clean.branches.levels, 24);
  assert.equal(clean.branches.depth, 6);
  assert.equal(clean.branches.angle, presetParams('oak').branches.angle);
  assert.equal(clean.branches.split, 1);
  assert.equal(clean.branches.taper, 0.95);
  assert.equal(clean.leaves.style, 'broad');
  assert.equal(clean.leaves.density, 2.6);
  assert.equal(clean.leaves.size, 0.02);
  assert.equal(clean.leaves.colorA, presetParams('oak').leaves.colorA);
  assert.equal(clean.leaves.wind, 2);
  assert.equal(clean.bark.lumpiness, 0.5);
  assert.equal(clean.bark.roughness, 0.1);
  assert.equal(clean.bark.colorB, '#123456');

  // a sanitised pathological design must still grow quickly and finite
  const started = performance.now();
  const tree = generateTree(clean);
  assert.ok(performance.now() - started < 4000);
  assert.ok(tree.stats.triangles > 0);
  const pos = tree.barkGeometry.getAttribute('position').array;
  for (let i = 0; i < pos.length; i += 1) assert.ok(Number.isFinite(pos[i]));
});
