import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTree } from '../src/generator/tree.js';
import { SPECIES_IDS, LIMITS, presetParams, QUALITY } from '../src/generator/params.js';
import { parallelTransportFrames, dot } from '../src/generator/vec.js';

function assertFinite(arr, name) {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) throw new Error(`${name}[${i}] is ${arr[i]}`);
  }
}

function assertGeometryValid(geom, label) {
  const vcount = geom.positions.length / 3;
  assert.equal(geom.normals.length, vcount * 3, `${label} normals`);
  assert.equal(geom.colors.length, vcount * 3, `${label} colors`);
  assert.equal(geom.uvs.length, vcount * 2, `${label} uvs`);
  assert.equal(geom.indices.length % 3, 0, `${label} index count`);
  assertFinite(geom.positions, `${label}.positions`);
  assertFinite(geom.normals, `${label}.normals`);
  assertFinite(geom.colors, `${label}.colors`);
  assertFinite(geom.uvs, `${label}.uvs`);
  for (let i = 0; i < geom.indices.length; i++) {
    assert.ok(geom.indices[i] < vcount, `${label} index out of range`);
  }
  for (let i = 0; i < geom.colors.length; i++) {
    assert.ok(geom.colors[i] >= 0 && geom.colors[i] <= 1, `${label} colour out of range`);
  }
  // No vertex below the soil
  for (let i = 1; i < geom.positions.length; i += 3) assert.ok(geom.positions[i] >= -1e-4, `${label} pierces soil: ${geom.positions[i]}`);
  if (vcount > 65535) assert.ok(geom.indices instanceof Uint32Array);
}

test('seeded generation is byte-for-byte deterministic', () => {
  for (const species of ['oak', 'willow']) {
    const a = generateTree({ species, seed: 2024, params: {} }, 'studio');
    const b = generateTree({ species, seed: 2024, params: {} }, 'studio');
    assert.deepEqual(a.stats, { ...b.stats, ms: a.stats.ms });
    assert.deepEqual(Array.from(a.bark.positions), Array.from(b.bark.positions));
    assert.deepEqual(Array.from(a.bark.indices), Array.from(b.bark.indices));
    assert.deepEqual(Array.from(a.foliage.positions), Array.from(b.foliage.positions));
    assert.deepEqual(Array.from(a.foliage.colors), Array.from(b.foliage.colors));
    const c = generateTree({ species, seed: 2025, params: {} }, 'studio');
    assert.notDeepEqual(Array.from(a.bark.positions.slice(0, 300)), Array.from(c.bark.positions.slice(0, 300)));
  }
});

test('string seeds are deterministic too', () => {
  const a = generateTree({ species: 'birch', seed: 'hello', params: {} }, 'preview');
  const b = generateTree({ species: 'birch', seed: 'hello', params: {} }, 'preview');
  assert.deepEqual(Array.from(a.bark.positions), Array.from(b.bark.positions));
});

test('every species at several seeds yields valid, in-budget geometry', () => {
  for (const species of SPECIES_IDS) {
    for (const seed of [1, 99, 31337]) {
      const t = generateTree({ species, seed, params: {} }, 'studio');
      assertGeometryValid(t.bark, `${species}#${seed}.bark`);
      assertGeometryValid(t.foliage, `${species}#${seed}.foliage`);
      assert.ok(t.stats.triangles <= LIMITS.maxTriangles, `${species}#${seed} ${t.stats.triangles} tris`);
      assert.ok(t.stats.leaves <= LIMITS.maxLeaves);
      assert.ok(t.stats.leaves > 1500, `${species}#${seed} too bare: ${t.stats.leaves}`);
      assert.ok(t.stats.triangles > 5000);
      assert.ok(t.stats.height > 3 && t.stats.height < 45);
      assert.ok(t.bounds.min[1] >= -1e-4);
      assert.equal(t.stats.triangles, t.bark.indices.length / 3 + t.foliage.indices.length / 3);
      assert.equal(t.foliage.indices.length / 3, t.stats.leaves * t.foliage.cardTriangles);
    }
  }
});

test('worst-case parameters stay inside the polygon budget', () => {
  const params = {
    ...presetParams('oak'),
    depth: 7, children: 12, childrenFalloff: 0, trunkSides: 32, trunkSegments: 48, branchSegments: 16,
    twigs: 1, leafDensity: 1, leafBudget: 32000, leafSize: 0.02, leafReach: 1, leafStartDepth: 0
  };
  const t = generateTree({ species: 'oak', seed: 5, params }, 'studio');
  assertGeometryValid(t.bark, 'worst.bark');
  assertGeometryValid(t.foliage, 'worst.foliage');
  assert.ok(t.stats.triangles <= LIMITS.maxTriangles, `${t.stats.triangles}`);
  assert.ok(t.stats.leaves <= LIMITS.maxLeaves);
  assert.ok(t.stats.limbs <= LIMITS.maxLimbs);
});

test('depth 1 and minimal parameters still produce a tree', () => {
  const params = { ...presetParams('maple'), depth: 1, children: 1, trunkSides: 3, trunkSegments: 4, branchSegments: 2, twigs: 0 };
  const t = generateTree({ species: 'maple', seed: 3, params }, 'studio');
  assert.ok(t.stats.triangles > 0);
  assert.equal(t.stats.depth, 1);
  assertGeometryValid(t.bark, 'min.bark');
});

test('leaf style none yields an empty foliage buffer and a bare tree', () => {
  const t = generateTree({ species: 'oak', seed: 11, params: { leafStyle: 'none' } }, 'studio');
  assert.equal(t.stats.leaves, 0);
  assert.equal(t.foliage.indices.length, 0);
  assert.equal(t.foliage.positions.length, 0);
  assert.equal(t.stats.triangles, t.stats.barkTriangles);
  assert.ok(t.stats.barkTriangles > 1000);
  assert.ok(t.stats.triangles < LIMITS.maxTriangles);
});

test('a hard card budget thins leaves uniformly and never bares the crown top', () => {
  const full = generateTree({ species: 'oak', seed: 4, params: { leafBudget: 32000 } }, 'studio');
  const tight = generateTree({ species: 'oak', seed: 4, params: { leafBudget: 2000 } }, 'studio');
  assert.ok(tight.stats.leaves <= 2000);
  assert.ok(full.stats.leaves > tight.stats.leaves);
  const topLeaves = (t) => {
    const top = t.bounds.max[1];
    let n = 0;
    for (let i = 1; i < t.foliage.positions.length; i += 3) if (t.foliage.positions[i] > top * 0.8) n++;
    return n;
  };
  const topFull = topLeaves(full);
  const topTight = topLeaves(tight);
  assert.ok(topTight > 0, 'crown top is bare under a tight budget');
  const ratio = topTight / topFull;
  const expected = tight.stats.leaves / full.stats.leaves;
  assert.ok(ratio > expected * 0.5, `top ratio ${ratio} vs overall ${expected}`);
});

test('quality tiers reduce triangle counts monotonically', () => {
  const d = { species: 'willow', seed: 8, params: {} };
  const studio = generateTree(d, 'studio').stats.triangles;
  const preview = generateTree(d, 'preview').stats.triangles;
  const software = generateTree(d, 'software').stats.triangles;
  assert.ok(studio > preview && preview > software, `${studio} ${preview} ${software}`);
  assert.ok(software <= QUALITY.software.triangleBudget);
});

test('hangers never go below the soil even with extreme droop', () => {
  const params = { ...presetParams('willow'), droop: 1, gravitropism: -1, leafDroop: 1, height: 3 };
  const t = generateTree({ species: 'willow', seed: 21, params }, 'studio');
  assert.ok(t.bounds.min[1] >= -1e-4);
});

test('parallel transport frames stay orthonormal and twist-free', () => {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push([Math.sin(i * 0.2) * 2, i * 0.3, Math.cos(i * 0.2) * 2]);
  const { tangents, normals, binormals } = parallelTransportFrames(pts);
  for (let i = 0; i < pts.length; i++) {
    assert.ok(Math.abs(dot(tangents[i], normals[i])) < 1e-6);
    assert.ok(Math.abs(dot(tangents[i], binormals[i])) < 1e-6);
    assert.ok(Math.abs(dot(normals[i], binormals[i])) < 1e-6);
    if (i > 0) assert.ok(dot(normals[i], normals[i - 1]) > 0.95, 'frame twisted');
  }
});

test('generation is fast enough for interactive use', () => {
  generateTree({ species: 'oak', seed: 1, params: {} }, 'studio'); // warm up
  const t0 = performance.now();
  for (const species of SPECIES_IDS) generateTree({ species, seed: 2, params: {} }, 'studio');
  const per = (performance.now() - t0) / SPECIES_IDS.length;
  assert.ok(per < 1500, `avg ${per}ms per tree`);
});
