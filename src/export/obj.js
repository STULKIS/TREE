/**
 * Wavefront OBJ + MTL text export. Positions / normals / UVs, one `usemtl`
 * per group (bark, foliage) — never repeated per face.
 */

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(5).replace(/\.?0+$/, '');
}

export function buildObj(tree, meta = {}) {
  const name = meta.name || `sapling-${tree.species || 'tree'}-${tree.seed || 0}`;
  const mtlName = `${name}.mtl`;
  const lines = [`# Sapling procedural tree — ${name}`, `# species=${tree.species} seed=${tree.seed}`, `mtllib ${mtlName}`, `o ${name}`];
  let vertexBase = 1;
  const groups = [
    { id: 'bark', geom: tree.bark },
    { id: 'foliage', geom: tree.foliage }
  ];
  for (const g of groups) {
    const geom = g.geom;
    if (!geom || !geom.indices || !geom.indices.length) continue;
    const { positions, normals, uvs, indices } = geom;
    const count = positions.length / 3;
    lines.push(`g ${g.id}`);
    lines.push(`usemtl ${g.id}`);
    for (let i = 0; i < count; i++) {
      lines.push(`v ${fmt(positions[i * 3])} ${fmt(positions[i * 3 + 1])} ${fmt(positions[i * 3 + 2])}`);
    }
    for (let i = 0; i < count; i++) {
      lines.push(`vt ${fmt(uvs[i * 2])} ${fmt(uvs[i * 2 + 1])}`);
    }
    for (let i = 0; i < count; i++) {
      lines.push(`vn ${fmt(normals[i * 3])} ${fmt(normals[i * 3 + 1])} ${fmt(normals[i * 3 + 2])}`);
    }
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] + vertexBase;
      const b = indices[i + 1] + vertexBase;
      const c = indices[i + 2] + vertexBase;
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    vertexBase += count;
  }
  lines.push('');
  return { obj: lines.join('\n'), mtl: buildMtl(tree, name), mtlName, objName: `${name}.obj` };
}

function hexToUnit(hex) {
  const h = (hex || '#808080').replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(4)).join(' ');
}

export function buildMtl(tree, name = 'sapling') {
  const p = tree.params || {};
  return [
    `# Sapling materials — ${name}`,
    'newmtl bark',
    `Kd ${hexToUnit(p.barkColor)}`,
    'Ka 0.1 0.1 0.1',
    'Ks 0.05 0.05 0.05',
    'Ns 10',
    'd 1',
    'illum 2',
    '',
    'newmtl foliage',
    `Kd ${hexToUnit(p.leafColor)}`,
    'Ka 0.1 0.1 0.1',
    'Ks 0.1 0.1 0.1',
    'Ns 20',
    'd 1',
    'illum 2',
    ''
  ].join('\n');
}
