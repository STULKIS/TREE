import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObj } from '../src/export/obj.js';
import { generateTree } from '../src/generator/tree.js';

test('OBJ declares each material exactly once and references a matching MTL', () => {
  const tree = generateTree({ species: 'maple', seed: 8, params: {} }, 'software');
  const { obj, mtl, mtlName } = buildObj(tree);
  const usemtl = obj.split('\n').filter((l) => l.startsWith('usemtl '));
  assert.deepEqual(usemtl, ['usemtl bark', 'usemtl foliage']);
  assert.equal(new Set(usemtl).size, usemtl.length);
  assert.ok(obj.includes(`mtllib ${mtlName}`));
  assert.equal((mtl.match(/^newmtl /gm) || []).length, 2);
  assert.ok(mtl.includes('newmtl bark') && mtl.includes('newmtl foliage'));
});

test('OBJ vertex / face counts match the geometry and indices are 1-based and in range', () => {
  const tree = generateTree({ species: 'pine', seed: 8, params: {} }, 'software');
  const { obj } = buildObj(tree);
  const lines = obj.split('\n');
  const v = lines.filter((l) => l.startsWith('v ')).length;
  const vt = lines.filter((l) => l.startsWith('vt ')).length;
  const vn = lines.filter((l) => l.startsWith('vn ')).length;
  const f = lines.filter((l) => l.startsWith('f '));
  const expectV = tree.bark.positions.length / 3 + tree.foliage.positions.length / 3;
  assert.equal(v, expectV);
  assert.equal(vt, expectV);
  assert.equal(vn, expectV);
  assert.equal(f.length, tree.stats.triangles);
  let min = Infinity;
  let max = -Infinity;
  for (const line of f) {
    for (const tok of line.slice(2).split(' ')) {
      const [p, t, n] = tok.split('/').map(Number);
      assert.equal(p, t);
      assert.equal(p, n);
      min = Math.min(min, p);
      max = Math.max(max, p);
    }
  }
  assert.equal(min, 1);
  assert.equal(max, expectV);
  assert.ok(!/NaN|Infinity/.test(obj));
});

test('bare trees emit only the bark group', () => {
  const tree = generateTree({ species: 'oak', seed: 8, params: { leafStyle: 'none' } }, 'software');
  const { obj } = buildObj(tree);
  assert.equal((obj.match(/^usemtl /gm) || []).length, 1);
});
