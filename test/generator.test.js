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
