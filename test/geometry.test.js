import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree } from '../src/generator/geometry.js';
import { sanitizeDesign, SPECIES_ORDER, presetParams, HARD_LIMITS, QUALITY } from '../src/generator/params.js';

const design = (species, seed, params = {}) => sanitizeDesign({ species, seed, params: { ...presetParams(species), ...params } });

function assertFinite(arr, label) {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) assert.fail(`${label}[${i}] is ${arr[i]}`);
  }
}

function assertMeshValid(group, label) {
  assert.equal(group.indices.length % 3, 0, `${label}: index count not a multiple of 3`);
  const vertexCount = group.positions.length / 3;
  assert.equal(group.normals.length, group.positions.length, `${label}: normals`);
  assert.equal(group.colors.length, group.positions.length, `${label}: colors`);
  assert.equal(group.uvs.length, vertexCount * 2, `${label}: uvs`);
  for (const i of group.indices) assert.ok(i < vertexCount, `${label}: index out of range`);
  assertFinite(group.positions, `${label}.positions`);
  assertFinite(group.normals, `${label}.normals`);
  assertFinite(group.colors, `${label}.colors`);
  assertFinite(group.uvs, `${label}.uvs`);
  for (let i = 0; i < group.colors.length; i++) {
    assert.ok(group.colors[i] >= 0 && group.colors[i] <= 1, `${label}: colour out of [0,1]`);
  }
}

test('every species builds valid geometry across several seeds at studio quality', () => {
  for (const sp of SPECIES_ORDER) {
    for (const seed of [1, 2, 3]) {
      const r = buildTree(design(sp, seed), 'studio');
      assertMeshValid(r.bark, `${sp}/${seed} bark`);
      assertMeshValid(r.foliage, `${sp}/${seed} foliage`);
      assert.ok(r.stats.triangles <= HARD_LIMITS.studioTriangles, `${sp}/${seed}: ${r.stats.triangles} triangles`);
      assert.ok(r.stats.leaves <= HARD_LIMITS.studioLeaves, `${sp}/${seed}: ${r.stats.leaves} leaves`);
      assert.ok(r.stats.triangles > 1000, `${sp}/${seed} is suspiciously small`);
      assert.ok(r.bounds.max[1] > r.bounds.min[1]);
    }
  }
});

test('the whole tree stays above the soil and never pierces it', () => {
  for (const sp of SPECIES_ORDER) {
    const r = buildTree(design(sp, 11), 'preview');
    for (let i = 1; i < r.bark.positions.length; i += 3) assert.ok(r.bark.positions[i] >= 0, `${sp} bark below soil`);
    for (let i = 1; i < r.foliage.positions.length; i += 3) assert.ok(r.foliage.positions[i] >= 0, `${sp} leaf below soil`);
  }
});

test('style none produces a bare tree with an empty foliage group', () => {
  const r = buildTree(design('oak', 4, { leafStyle: 'none' }), 'studio');
  assert.equal(r.stats.leaves, 0);
  assert.equal(r.foliage.indices.length, 0);
  assert.equal(r.foliage.positions.length, 0);
  assert.deepEqual(Array.from(r.foliage.cardStarts), [0]);
  assert.ok(r.bark.indices.length > 0);
  assert.equal(r.stats.foliageTriangles, 0);
});

test('zero density is equivalent to a bare tree', () => {
  const r = buildTree(design('birch', 4, { leafDensity: 0 }), 'preview');
  assert.equal(r.stats.leaves, 0);
});

test('leaf card budget is a hard ceiling and the crown top is still populated', () => {
  const capped = buildTree(design('pine', 2, { leafCap: 500 }), 'studio');
  assert.ok(capped.stats.leaves <= 500, `got ${capped.stats.leaves}`);
  assert.ok(capped.stats.leaves > 0);
  // With a tight budget the highest sites win: the top 30% of the tree should keep cards.
  const top = capped.bounds.max[1] * 0.7;
  let topCards = 0;
  const starts = capped.foliage.cardStarts;
  for (let c = 0; c + 1 < starts.length; c++) {
    const base = capped.foliage.indices[starts[c] * 3];
    if (capped.foliage.positions[base * 3 + 1] >= top) topCards++;
  }
  assert.ok(topCards >= capped.stats.leaves * 0.5, `only ${topCards}/${capped.stats.leaves} cards near the top`);
});

test('depth extremes (1 and 7) build and respect budgets', () => {
  for (const depth of [1, 7]) {
    const r = buildTree(design('maple', 9, { depth, children: 5 }), 'studio');
    assertMeshValid(r.bark, `depth ${depth} bark`);
    assert.ok(r.stats.triangles <= HARD_LIMITS.studioTriangles);
    assert.ok(r.stats.depth <= depth);
  }
});

test('software quality stays under the 70k triangle budget at worst case', () => {
  for (const sp of SPECIES_ORDER) {
    for (const seed of [1, 5, 9]) {
      const r = buildTree(design(sp, seed, { depth: 7, children: 5, leafCap: 30000 }), 'software');
      assert.ok(r.stats.triangles <= HARD_LIMITS.softwareTriangles, `${sp}/${seed}: ${r.stats.triangles}`);
    }
  }
});

test('generation is deterministic: identical bytes for identical design and quality', () => {
  const a = buildTree(design('willow', 1234), 'studio');
  const b = buildTree(design('willow', 1234), 'studio');
  assert.deepEqual(Buffer.from(a.bark.positions.buffer), Buffer.from(b.bark.positions.buffer));
  assert.deepEqual(Buffer.from(a.foliage.colors.buffer), Buffer.from(b.foliage.colors.buffer));
  assert.deepEqual(Buffer.from(a.foliage.indices.buffer), Buffer.from(b.foliage.indices.buffer));
  const c = buildTree(design('willow', 1235), 'studio');
  assert.notDeepEqual(Buffer.from(a.bark.positions.buffer), Buffer.from(c.bark.positions.buffer));
});

test('vertex normals are unit length on the bark', () => {
  const r = buildTree(design('oak', 3), 'preview');
  for (let i = 0; i < r.bark.normals.length; i += 3) {
    const l = Math.hypot(r.bark.normals[i], r.bark.normals[i + 1], r.bark.normals[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-3, `normal length ${l}`);
  }
});

test('preview and software tiers are lighter than studio', () => {
  const s = buildTree(design('birch', 6), 'studio').stats.triangles;
  const p = buildTree(design('birch', 6), 'preview').stats.triangles;
  assert.ok(p < s);
  assert.ok(QUALITY.preview.maxLimbs < QUALITY.studio.maxLimbs);
});
