import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGlb, parseGlb } from '../src/export/glb.js';
import { generateTree } from '../src/generator/tree.js';

test('GLB has a valid header, aligned chunks and parseable JSON', () => {
  const tree = generateTree({ species: 'oak', seed: 12, params: {} }, 'preview');
  const buf = buildGlb(tree);
  const dv = new DataView(buf);
  assert.equal(dv.getUint32(0, true), 0x46546c67);
  assert.equal(dv.getUint32(4, true), 2);
  assert.equal(dv.getUint32(8, true), buf.byteLength);
  assert.equal(buf.byteLength % 4, 0);
  const jsonLen = dv.getUint32(12, true);
  assert.equal(jsonLen % 4, 0);
  const { json, bin } = parseGlb(buf);
  assert.equal(json.asset.version, '2.0');
  assert.equal(bin.byteLength % 4, 0);
  assert.equal(json.buffers[0].byteLength, bin.byteLength);
  for (const v of json.bufferViews) {
    assert.equal(v.byteOffset % 4, 0);
    assert.ok(v.byteOffset + v.byteLength <= bin.byteLength);
  }
});

test('one primitive per material with normals, colours, uvs and correct min/max', () => {
  const tree = generateTree({ species: 'blossom', seed: 5, params: {} }, 'preview');
  const { json, readAccessor } = parseGlb(buildGlb(tree));
  assert.equal(json.meshes.length, 1);
  const prims = json.meshes[0].primitives;
  assert.equal(prims.length, 2);
  assert.equal(json.materials.length, 2, 'no duplicated materials');
  const names = json.materials.map((m) => m.name);
  assert.deepEqual(names, ['Bark', 'Foliage']);
  assert.equal(json.materials[1].doubleSided, true);
  assert.equal(new Set(prims.map((p) => p.material)).size, 2);
  for (const [i, prim] of prims.entries()) {
    assert.equal(prim.mode, 4);
    for (const k of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']) assert.ok(k in prim.attributes, k);
    const pos = readAccessor(prim.attributes.POSITION);
    const acc = json.accessors[prim.attributes.POSITION];
    assert.equal(acc.type, 'VEC3');
    assert.equal(acc.count, pos.length / 3);
    const src = i === 0 ? tree.bark : tree.foliage;
    assert.deepEqual(Array.from(pos), Array.from(src.positions));
    const expectMin = [Infinity, Infinity, Infinity];
    const expectMax = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < pos.length; j += 3) {
      for (let k = 0; k < 3; k++) {
        expectMin[k] = Math.min(expectMin[k], pos[j + k]);
        expectMax[k] = Math.max(expectMax[k], pos[j + k]);
      }
    }
    assert.deepEqual(acc.min, expectMin);
    assert.deepEqual(acc.max, expectMax);
    const idxAcc = json.accessors[prim.indices];
    assert.equal(idxAcc.type, 'SCALAR');
    assert.ok(idxAcc.componentType === 5123 || idxAcc.componentType === 5125);
    const idx = readAccessor(prim.indices);
    assert.equal(idx.length % 3, 0);
    assert.equal(idxAcc.max[0], acc.count - 1 >= 0 ? Math.max(...idx) : 0);
    const normals = readAccessor(prim.attributes.NORMAL);
    assert.equal(normals.length, pos.length);
    const colors = readAccessor(prim.attributes.COLOR_0);
    assert.equal(json.accessors[prim.attributes.COLOR_0].type, 'VEC3');
    assert.equal(colors.length, pos.length);
    // Linear RGB per the glTF spec: every value in range and darker-or-equal than the sRGB source
    for (let j = 0; j < colors.length; j += 97) {
      assert.ok(colors[j] >= 0 && colors[j] <= 1);
      assert.ok(colors[j] <= src.colors[j] + 1e-6);
    }
    const uv = readAccessor(prim.attributes.TEXCOORD_0);
    assert.equal(uv.length / 2, pos.length / 3);
  }
  assert.equal(json.extras.sapling.seed, 5);
  assert.equal(json.extras.sapling.species, 'blossom');
});

test('bare trees export a single bark primitive', () => {
  const tree = generateTree({ species: 'birch', seed: 2, params: { leafStyle: 'none' } }, 'preview');
  const { json } = parseGlb(buildGlb(tree));
  assert.equal(json.meshes[0].primitives.length, 1);
  assert.equal(json.materials.length, 1);
});

test('large meshes use 32-bit indices', () => {
  const tree = generateTree({ species: 'willow', seed: 1, params: {} }, 'studio');
  assert.ok(tree.bark.positions.length / 3 > 65535);
  const { json } = parseGlb(buildGlb(tree));
  const prim = json.meshes[0].primitives[0];
  assert.equal(json.accessors[prim.indices].componentType, 5125);
});
