// OBJ + MTL writer. Groups are emitted once each with a single `usemtl`; per-vertex colours
// use the widely supported "v x y z r g b" extension. Colours are written sRGB for viewers.

const f = (n) => (Math.abs(n) < 5e-7 ? 0 : n).toFixed(6);
const toSRGB = (v) => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

/**
 * @returns {{obj: string, mtl: string}}
 */
export function buildOBJ(result, { baseName = 'sapling', species = '', seed = 0 } = {}) {
  const lines = [];
  lines.push('# Sapling procedural tree export');
  lines.push(`# species: ${species}  seed: ${seed}`);
  lines.push(`mtllib ${baseName}.mtl`);
  lines.push('o tree');
  let offset = 0;
  const groups = [
    { name: 'bark', mat: 'Bark', data: result.bark },
    { name: 'foliage', mat: 'Foliage', data: result.foliage },
  ];
  for (const g of groups) {
    const { positions, normals, colors, uvs, indices } = g.data;
    const v = positions.length / 3;
    if (indices.length === 0) continue;
    lines.push(`g ${g.name}`);
    for (let i = 0; i < v; i++) {
      lines.push(`v ${f(positions[i * 3])} ${f(positions[i * 3 + 1])} ${f(positions[i * 3 + 2])} ${toSRGB(colors[i * 3]).toFixed(4)} ${toSRGB(colors[i * 3 + 1]).toFixed(4)} ${toSRGB(colors[i * 3 + 2]).toFixed(4)}`);
    }
    for (let i = 0; i < v; i++) lines.push(`vt ${f(uvs[i * 2])} ${f(uvs[i * 2 + 1])}`);
    for (let i = 0; i < v; i++) lines.push(`vn ${f(normals[i * 3])} ${f(normals[i * 3 + 1])} ${f(normals[i * 3 + 2])}`);
    lines.push(`usemtl ${g.mat}`);
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] + offset + 1;
      const b = indices[t + 1] + offset + 1;
      const c = indices[t + 2] + offset + 1;
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    offset += v;
  }
  const mtl = [
    '# Sapling materials',
    'newmtl Bark',
    'Ka 0.200 0.150 0.100',
    'Kd 1.000 1.000 1.000',
    'Ks 0.040 0.040 0.040',
    'Ns 10',
    'd 1',
    'illum 2',
    '',
    'newmtl Foliage',
    'Ka 0.100 0.150 0.100',
    'Kd 1.000 1.000 1.000',
    'Ks 0.050 0.050 0.050',
    'Ns 10',
    'd 1',
    'illum 2',
    '',
  ].join('\n');
  return { obj: lines.join('\n') + '\n', mtl };
}
