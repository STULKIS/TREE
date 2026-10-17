import * as THREE from 'three';

/**
 * Builders return Blobs so they can be unit-tested; the download helpers are
 * a thin DOM layer on top.
 */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function treeSlug(params, stats) {
  return `sapling-${params.species}-${String(stats.seed).padStart(5, '0')}`;
}

export function buildExportScene(tree, params, { includeFoliage = true } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'Sapling_Tree';

  const barkMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: params.bark.roughness,
    metalness: 0,
    name: 'Sapling_Bark',
  });
  const bark = new THREE.Mesh(tree.barkGeometry, barkMaterial);
  bark.name = 'Bark';
  scene.add(bark);

  if (includeFoliage && tree.leafGeometry) {
    const leafMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      name: 'Sapling_Leaves',
    });
    const leaves = new THREE.Mesh(tree.leafGeometry, leafMaterial);
    leaves.name = 'Foliage';
    scene.add(leaves);
  }

  scene.updateMatrixWorld(true);
  return scene;
}

export async function buildGLB(tree, params, options) {
  // Loaded lazily so the studio's first paint stays light.
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const scene = buildExportScene(tree, params, options);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
  return new Blob([result], { type: 'model/gltf-binary' });
}

export function mtlText(params) {
  return `# Sapling — procedural tree studio
# Tree: ${params.species}  seed: ${params.seed}
newmtl Sapling_Bark
Ka 1.000 1.000 1.000
Kd 0.420 0.350 0.270
Ks 0.000 0.000 0.000
d 1.0
illum 2

newmtl Sapling_Leaves
Ka 1.000 1.000 1.000
Kd 0.420 0.520 0.260
Ks 0.000 0.000 0.000
d 1.0
illum 2
`;
}

export async function buildOBJ(tree, params, options) {
  const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js');
  const scene = buildExportScene(tree, params, options);
  const exporter = new OBJExporter();
  const base = treeSlug(params, tree.stats);
  const obj = `mtllib ${base}.mtl\n${exporter.parse(scene)}`;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file(`${base}.obj`, obj);
  zip.file(`${base}.mtl`, mtlText(params));
  zip.file(
    'README.txt',
    [
      'Sapling — procedural tree export',
      '',
      `Species: ${params.species}`,
      `Seed: ${params.seed}`,
      `Height: ${tree.stats.height.toFixed(2)} m`,
      `Triangles: ${tree.stats.triangles}`,
      '',
      'Units are meters, the origin sits at the trunk base, +Y is up.',
      'Foliage is made of double-sided leaf cards; enable transparency or',
      'two-sided shading in your renderer.',
    ].join('\n'),
  );
  return zip.generateAsync({ type: 'blob' });
}

export function buildParamsJSON(tree, params) {
  const payload = {
    app: 'Sapling',
    version: 1,
    species: params.species,
    seed: params.seed,
    stats: tree.stats,
    params: JSON.parse(JSON.stringify(params)),
    createdAt: new Date().toISOString(),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

const EXT = { glb: 'glb', obj: 'zip', json: 'json' };

export async function exportAs(format, tree, params, options) {
  const base = treeSlug(params, tree.stats);
  const filename = `${base}.${EXT[format] || 'glb'}`;
  const blob = format === 'obj'
    ? await buildOBJ(tree, params, options)
    : format === 'json'
      ? buildParamsJSON(tree, params)
      : await buildGLB(tree, params, options);
  download(blob, filename);
  return filename;
}

export function snapshot(filename = 'sapling-tree.png', dataUrl) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
