// Hand-written binary glTF 2.0 writer. One primitive per material, indexed triangles,
// normals, linear vertex colours (COLOR_0), UVs and min/max on every POSITION accessor.

const GLTF_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLOAT = 5126;
const UINT32 = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const pad4 = (n) => (n + 3) & ~3;

function minMax(arr, comps) {
  const min = new Array(comps).fill(Infinity);
  const max = new Array(comps).fill(-Infinity);
  for (let i = 0; i < arr.length; i += comps) {
    for (let c = 0; c < comps; c++) {
      const v = arr[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

/**
 * @param {{bark:object, foliage:object, bounds:object}} result
 * @param {{name?: string, extras?: object}} [opts]
 * @returns {Uint8Array}
 */
export function buildGLB(result, { name = 'Sapling tree', extras = {} } = {}) {
  const chunks = [];
  let binLength = 0;
  const bufferViews = [];
  const accessors = [];

  const addView = (typed, target) => {
    const offset = pad4(binLength);
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    chunks.push({ offset, bytes });
    binLength = offset + bytes.byteLength;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    return bufferViews.length - 1;
  };

  const addAccessor = (typed, type, componentType, count, target, withMinMax = false) => {
    const view = addView(typed, target);
    const acc = { bufferView: view, byteOffset: 0, componentType, count, type };
    if (withMinMax) {
      const comps = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
      const mm = minMax(typed, comps);
      acc.min = mm.min;
      acc.max = mm.max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const materials = [
    { name: 'Bark', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.92 }, doubleSided: false },
    { name: 'Foliage', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.7 }, doubleSided: true },
  ];

  const primitives = [];
  [result.bark, result.foliage].forEach((group, matIndex) => {
    const triCount = group.indices.length;
    if (triCount === 0) return; // never emit empty primitives (bare-leaf case)
    const vCount = group.positions.length / 3;
    const attributes = {
      POSITION: addAccessor(group.positions, 'VEC3', FLOAT, vCount, ARRAY_BUFFER, true),
      NORMAL: addAccessor(group.normals, 'VEC3', FLOAT, vCount, ARRAY_BUFFER),
      COLOR_0: addAccessor(group.colors, 'VEC3', FLOAT, vCount, ARRAY_BUFFER),
      TEXCOORD_0: addAccessor(group.uvs, 'VEC2', FLOAT, vCount, ARRAY_BUFFER),
    };
    const indices = addAccessor(group.indices, 'SCALAR', UINT32, triCount, ELEMENT_ARRAY_BUFFER);
    primitives.push({ attributes, indices, material: matIndex, mode: 4 });
  });

  const json = {
    asset: { version: '2.0', generator: 'Sapling procedural studio', extras },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives }],
    materials,
    buffers: [{ byteLength: binLength }],
    bufferViews,
    accessors,
  };

  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPadded = pad4(jsonBytes.byteLength);
  const binPadded = pad4(binLength);
  const total = 12 + 8 + jsonPadded + (binLength > 0 ? 8 + binPadded : 0);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLTF_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let o = 12;
  view.setUint32(o, jsonPadded, true);
  view.setUint32(o + 4, CHUNK_JSON, true);
  out.set(jsonBytes, o + 8);
  out.fill(0x20, o + 8 + jsonBytes.byteLength, o + 8 + jsonPadded);
  o += 8 + jsonPadded;
  if (binLength > 0) {
    view.setUint32(o, binPadded, true);
    view.setUint32(o + 4, CHUNK_BIN, true);
    const base = o + 8;
    for (const c of chunks) out.set(c.bytes, base + c.offset);
  }
  return out;
}
