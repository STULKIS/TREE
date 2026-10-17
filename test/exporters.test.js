import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree } from '../src/generator/geometry.js';
import { sanitizeDesign, presetParams } from '../src/generator/params.js';
import { buildGLB } from '../src/export/glb.js';
import { buildOBJ } from '../src/export/obj.js';
import { designToJSON, designFromJSON } from '../src/export/design.js';
import { dataURLToBlob, fileStem } from '../src/export/snapshot.js';

const design = (species, seed, params = {}) => sanitizeDesign({ species, seed, params: { ...presetParams(species), ...params } });

/** Minimal independent GLB reader used to verify what we wrote. */
function readGLB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'magic');
  assert.equal(dv.getUint32(4, true), 2, 'version');
  assert.equal(dv.getUint32(8, true), bytes.byteLength, 'declared length');
  const jsonLen = dv.getUint32(12, true);
  assert.equal(dv.getUint32(16, true), 0x4e4f534a, 'JSON chunk type');
  assert.equal(jsonLen % 4, 0, 'JSON chunk 4-byte aligned');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const binStart = 20 + jsonLen;
  const binLen = dv.getUint32(binStart, true);
  assert.equal(dv.getUint32(binStart + 4, true), 0x004e4942, 'BIN chunk type');
  assert.equal(binLen % 4, 0, 'BIN chunk 4-byte aligned');
  const bin = bytes.subarray(binStart + 8, binStart + 8 + binLen);
  return { json, bin, binLen };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  assert.equal(view.byteOffset % 4, 0, 'bufferView offset aligned');
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[acc.type];
  const size = { 5126: 4, 5125: 4 }[acc.componentType];
  const slice = bin.buffer.slice(bin.byteOffset + view.byteOffset, bin.byteOffset + view.byteOffset + acc.count * comps * size);
  const arr = acc.componentType === 5125 ? new Uint32Array(slice) : new Float32Array(slice);
  return { acc, arr, comps };
}

test('GLB: header, chunks, alignment and one primitive per material', () => {
  const r = buildTree(design('oak', 3), 'preview');
  const bytes = buildGLB(r, { name: 'Oak 3' });
  const { json, bin } = readGLB(bytes);
  assert.equal(json.asset.version, '2.0');
  const prims = json.meshes[0].primitives;
  assert.equal(prims.length, 2, 'bark + foliage');
  assert.deepEqual(prims.map((p) => p.material), [0, 1]);
  assert.equal(json.materials.length, 2, 'no duplicated materials');
  assert.deepEqual(json.materials.map((m) => m.name), ['Bark', 'Foliage']);
  assert.equal(json.materials[1].doubleSided, true);
  assert.equal(json.materials[0].doubleSided, false);
  for (const p of prims) {
    assert.equal(p.mode, 4);
    assert.ok(p.attributes.POSITION !== undefined && p.attributes.NORMAL !== undefined);
    assert.ok(p.attributes.COLOR_0 !== undefined, 'vertex colours present');
    assert.ok(p.attributes.TEXCOORD_0 !== undefined, 'UVs present');
  }
  assert.equal(json.buffers[0].byteLength, bin.byteLength || json.buffers[0].byteLength);
});

test('GLB: accessors read back to the exact mesh, with correct min/max', () => {
  const r = buildTree(design('birch', 8), 'preview');
  const { json, bin } = readGLB(buildGLB(r));
  const bark = json.meshes[0].primitives[0];
  const pos = readAccessor(json, bin, bark.attributes.POSITION);
  assert.equal(pos.acc.count, r.bark.positions.length / 3);
  assert.equal(pos.acc.type, 'VEC3');
  for (let c = 0; c < 3; c++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = c; i < pos.arr.length; i += 3) { lo = Math.min(lo, pos.arr[i]); hi = Math.max(hi, pos.arr[i]); }
    assert.ok(Math.abs(pos.acc.min[c] - lo) < 1e-5 && Math.abs(pos.acc.max[c] - hi) < 1e-5, `min/max axis ${c}`);
  }
  const idx = readAccessor(json, bin, bark.indices);
  assert.equal(idx.acc.componentType, 5125);
  assert.equal(idx.acc.count, r.bark.indices.length);
  assert.deepEqual(Array.from(idx.arr), Array.from(r.bark.indices));
  const col = readAccessor(json, bin, bark.attributes.COLOR_0);
  for (const v of col.arr) assert.ok(v >= 0 && v <= 1);
});

test('GLB: a bare tree emits only the bark primitive', () => {
  const r = buildTree(design('oak', 2, { leafStyle: 'none' }), 'preview');
  const { json } = readGLB(buildGLB(r));
  assert.equal(json.meshes[0].primitives.length, 1);
  for (const acc of json.accessors) assert.ok(acc.count > 0, 'no zero-count accessors');
});

test('OBJ: one usemtl per group, never repeated per face; indices valid', () => {
  const r = buildTree(design('maple', 5), 'preview');
  const { obj, mtl } = buildOBJ(r, { baseName: 'sapling-maple-5', species: 'maple', seed: 5 });
  const lines = obj.split('\n');
  const usemtl = lines.filter((l) => l.startsWith('usemtl '));
  assert.deepEqual(usemtl, ['usemtl Bark', 'usemtl Foliage']);
  const v = lines.filter((l) => l.startsWith('v ')).length;
  const vt = lines.filter((l) => l.startsWith('vt ')).length;
  const vn = lines.filter((l) => l.startsWith('vn ')).length;
  assert.equal(v, vt);
  assert.equal(v, vn);
  assert.equal(v, r.bark.positions.length / 3 + r.foliage.positions.length / 3);
  const faces = lines.filter((l) => l.startsWith('f '));
  assert.equal(faces.length, (r.bark.indices.length + r.foliage.indices.length) / 3);
  for (const f of faces.slice(0, 2000)) {
    for (const ref of f.split(' ').slice(1)) {
      const i = Number(ref.split('/')[0]);
      assert.ok(i >= 1 && i <= v, `face index ${i}`);
    }
  }
  assert.ok(lines.includes('mtllib sapling-maple-5.mtl'));
  assert.ok(mtl.includes('newmtl Bark') && mtl.includes('newmtl Foliage'));
});

test('OBJ: a bare tree omits the foliage group entirely', () => {
  const r = buildTree(design('oak', 2, { leafStyle: 'none' }), 'preview');
  const { obj } = buildOBJ(r);
  assert.equal(obj.includes('usemtl Foliage'), false);
  assert.equal(obj.split('\n').filter((l) => l.startsWith('usemtl ')).length, 1);
});

test('design JSON round-trips exactly and rejects foreign files', () => {
  const d = design('willow', 424242, { height: 11.5, leafStyle: 'slender' });
  const text = designToJSON(d, { triangles: 1 });
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'sapling.design');
  assert.deepEqual(designFromJSON(text), d);
  assert.throws(() => designFromJSON('[1,2,3]'), TypeError);
  assert.throws(() => designFromJSON('{"format":"other"}'), TypeError);
  assert.throws(() => designFromJSON('{'), SyntaxError);
  assert.throws(() => designFromJSON('x'.repeat(300000)), RangeError);
});

test('design JSON from hostile input goes through the sanitiser', () => {
  const hostile = JSON.stringify({ species: 'pine', seed: 1, params: { height: 'NaN', depth: 50, leafStyle: 'lasers', barkColor: 'red' } });
  const d = designFromJSON(hostile);
  assert.equal(d.params.depth, 7);
  assert.equal(d.params.leafStyle, 'needle');
  assert.equal(d.params.barkColor, presetParams('pine').barkColor);
  assert.equal(d.params.height, presetParams('pine').height);
});

test('file stems carry species and seed; data URLs decode to PNG bytes', () => {
  assert.equal(fileStem({ species: 'birch', seed: 9 }), 'sapling-birch-9');
  assert.equal(fileStem({ species: 'birch', seed: 9 }, 'snapshot'), 'sapling-birch-9-snapshot');
  const blob = dataURLToBlob('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 8);
});
