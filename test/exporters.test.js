import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { makeParams } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Blob = dom.window.Blob;
globalThis.FileReader = dom.window.FileReader;
globalThis.ProgressEvent = dom.window.ProgressEvent;

const { buildGLB, buildOBJ, buildParamsJSON, treeSlug } = await import('../src/export/exporters.js');

const params = makeParams('oak', 3131);
const tree = generateTree(params);

test('GLB export emits a valid binary glTF container', async () => {
  const blob = await buildGLB(tree, params);
  const buffer = Buffer.from(await blob.arrayBuffer());
  assert.equal(buffer.length > 1000, true);
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  const version = buffer.readUInt32LE(4);
  assert.equal(version, 2);
  const declaredLength = buffer.readUInt32LE(8);
  assert.equal(declaredLength, buffer.length);
  const jsonChunkLength = buffer.readUInt32LE(12);
  assert.equal(buffer.toString('utf8', 16, 20), 'JSON');
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonChunkLength));
  const names = json.nodes.map((node) => node.name);
  assert.ok(names.includes('Bark'));
  assert.ok(names.includes('Foliage'));
  assert.ok(json.meshes.length >= 2);
  assert.ok(json.materials.some((material) => material.name === 'Sapling_Bark'));
});

test('foliage can be excluded from the export', async () => {
  const blob = await buildGLB(tree, params, { includeFoliage: false });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const jsonChunkLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonChunkLength));
  assert.deepEqual(json.nodes.map((node) => node.name), ['Bark']);
});

test('OBJ archive contains obj, mtl and a readme', async () => {
  const blob = await buildOBJ(tree, params);
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const keys = Object.keys(zip.files).sort();
  assert.deepEqual(keys, [
    'README.txt',
    `${treeSlug(params, tree.stats)}.mtl`,
    `${treeSlug(params, tree.stats)}.obj`,
  ]);
  const obj = await zip.file(`${treeSlug(params, tree.stats)}.obj`).async('string');
  assert.match(obj, /^mtllib /);
  assert.match(obj, /^o Bark$/m);
  assert.match(obj, /^usemtl Sapling_Bark$/m);
  assert.match(obj, /^o Foliage$/m);
  assert.match(obj, /^v /m);
  assert.match(obj, /^f /m);
  const mtl = await zip.file(`${treeSlug(params, tree.stats)}.mtl`).async('string');
  assert.match(mtl, /newmtl Sapling_Leaves/);
});

test('parameter JSON round-trips the design', async () => {
  const blob = buildParamsJSON(tree, params);
  const payload = JSON.parse(await blob.text());
  assert.equal(payload.seed, params.seed);
  assert.equal(payload.params.leaves.style, params.leaves.style);
  assert.equal(payload.species, 'oak');
  assert.ok(payload.stats.triangles > 0);
});
