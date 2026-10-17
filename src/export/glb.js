/**
 * Hand-written binary glTF 2.0 (GLB) writer. One mesh primitive per material
 * (bark, foliage); indexed geometry with normals, vertex colours and UVs,
 * accessor min/max, embedded PBR materials, 4-byte aligned chunks.
 */
import { hexToRgb } from '../generator/color.js';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const UINT16 = 5123;
const UINT32 = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function pad4(n) {
  return (n + 3) & ~3;
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** glTF COLOR_0 is linear RGB; the generator bakes sRGB-space colours. */
function linearColors(colors) {
  const out = new Float32Array(colors.length);
  for (let i = 0; i < colors.length; i++) out[i] = srgbToLinear(colors[i]);
  return out;
}

function minMax(arr, comps) {
  const min = new Array(comps).fill(Infinity);
  const max = new Array(comps).fill(-Infinity);
  for (let i = 0; i < arr.length; i += comps) {
    for (let k = 0; k < comps; k++) {
      const v = arr[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (!arr.length) return { min: new Array(comps).fill(0), max: new Array(comps).fill(0) };
  return { min, max };
}

/**
 * Build a GLB ArrayBuffer from a generated tree.
 * @param {object} tree result of generateTree
 * @param {object} [meta] `{ name, species, seed, params }`
 */
export function buildGlb(tree, meta = {}) {
  const buffers = [];
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const primitives = [];
  let byteOffset = 0;

  const pushView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const view = { buffer: 0, byteOffset, byteLength: bytes.byteLength };
    if (target) view.target = target;
    bufferViews.push(view);
    buffers.push(bytes);
    const padded = pad4(bytes.byteLength);
    if (padded !== bytes.byteLength) buffers.push(new Uint8Array(padded - bytes.byteLength));
    byteOffset += padded;
    return bufferViews.length - 1;
  };

  const pushAccessor = (typed, comps, type, componentType, target, withMinMax) => {
    const view = pushView(typed, target);
    const acc = { bufferView: view, componentType, count: typed.length / comps, type };
    if (withMinMax) Object.assign(acc, minMax(typed, comps));
    accessors.push(acc);
    return accessors.length - 1;
  };

  const addPrimitive = (geom, materialDef) => {
    if (!geom || !geom.indices || geom.indices.length === 0) return;
    materials.push(materialDef);
    const materialIndex = materials.length - 1;
    const attributes = {
      POSITION: pushAccessor(geom.positions, 3, 'VEC3', FLOAT, ARRAY_BUFFER, true),
      NORMAL: pushAccessor(geom.normals, 3, 'VEC3', FLOAT, ARRAY_BUFFER, false),
      TEXCOORD_0: pushAccessor(geom.uvs, 2, 'VEC2', FLOAT, ARRAY_BUFFER, false),
      COLOR_0: pushAccessor(linearColors(geom.colors), 3, 'VEC3', FLOAT, ARRAY_BUFFER, false)
    };
    const indices = geom.indices;
    const indexType = indices instanceof Uint32Array ? UINT32 : UINT16;
    const idx = indices instanceof Uint32Array || indices instanceof Uint16Array ? indices : new Uint32Array(indices);
    const indicesAcc = pushAccessor(idx, 1, 'SCALAR', indexType, ELEMENT_ARRAY_BUFFER, true);
    primitives.push({ attributes, indices: indicesAcc, material: materialIndex, mode: 4 });
  };

  const params = tree.params || {};
  const bark = hexToRgb(params.barkColor || '#5b4634');
  const leaf = hexToRgb(params.leafColor || '#3f7a2d');

  addPrimitive(tree.bark, {
    name: 'Bark',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 },
    doubleSided: false,
    extras: { role: 'bark', tint: bark }
  });
  addPrimitive(tree.foliage, {
    name: 'Foliage',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.7 },
    doubleSided: true,
    extras: { role: 'foliage', tint: leaf }
  });

  const name = meta.name || `sapling-${tree.species || 'tree'}-${tree.seed || 0}`;
  const json = {
    asset: { version: '2.0', generator: 'Sapling procedural tree studio', copyright: 'Generated procedurally' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name: `${name}-mesh`, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
    extras: {
      sapling: {
        species: tree.species,
        seed: tree.seed,
        params: tree.params,
        stats: tree.stats
      }
    }
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = pad4(jsonBytes.byteLength);
  const binLength = byteOffset;
  const total = 12 + 8 + jsonPadded + 8 + binLength;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  let o = 0;
  dv.setUint32(o, GLB_MAGIC, true); o += 4;
  dv.setUint32(o, 2, true); o += 4;
  dv.setUint32(o, total, true); o += 4;
  dv.setUint32(o, jsonPadded, true); o += 4;
  dv.setUint32(o, JSON_CHUNK, true); o += 4;
  u8.set(jsonBytes, o);
  for (let i = jsonBytes.byteLength; i < jsonPadded; i++) u8[o + i] = 0x20; // pad JSON with spaces
  o += jsonPadded;
  dv.setUint32(o, binLength, true); o += 4;
  dv.setUint32(o, BIN_CHUNK, true); o += 4;
  for (const b of buffers) {
    u8.set(b, o);
    o += b.byteLength;
  }
  return out;
}

/**
 * Parse a GLB back into `{ json, bin }` plus accessor readers (tests + import checks).
 */
export function parseGlb(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB');
  const version = dv.getUint32(4, true);
  const length = dv.getUint32(8, true);
  let o = 12;
  let json = null;
  let bin = null;
  while (o < length) {
    const chunkLen = dv.getUint32(o, true);
    const chunkType = dv.getUint32(o + 4, true);
    const data = new Uint8Array(buffer, o + 8, chunkLen);
    if (chunkType === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(data));
    else if (chunkType === BIN_CHUNK) bin = data;
    o += 8 + chunkLen;
  }
  const readAccessor = (index) => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    const Ctor = { [FLOAT]: Float32Array, [UINT16]: Uint16Array, [UINT32]: Uint32Array }[acc.componentType];
    const start = bin.byteOffset + (view.byteOffset || 0);
    return new Ctor(bin.buffer.slice(start, start + acc.count * comps * Ctor.BYTES_PER_ELEMENT));
  };
  return { version, length, json, bin, readAccessor };
}
