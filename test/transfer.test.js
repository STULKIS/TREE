import test from 'node:test';
import assert from 'node:assert/strict';
import { makeParams } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';
import { packGeometry, unpackGeometry } from '../src/generator/transfer.js';

test('geometry survives the worker transfer byte for byte', () => {
  const tree = generateTree(makeParams('maple', 606));
  for (const geometry of [tree.barkGeometry, tree.leafGeometry]) {
    const packed = packGeometry(geometry);
    assert.ok(packed.position instanceof Float32Array);
    assert.ok(packed.index instanceof Uint32Array || packed.index instanceof Uint16Array);
    assert.equal(packed.transfer.length, 5);
    const restored = unpackGeometry(packed);
    assert.deepEqual(
      Array.from(restored.attributes.position.array),
      Array.from(geometry.attributes.position.array),
    );
    assert.deepEqual(
      Array.from(restored.index.array),
      Array.from(geometry.index.array),
    );
    assert.equal(restored.attributes.color.count, geometry.attributes.color.count);
    assert.equal(restored.attributes.uv.count, geometry.attributes.uv.count);
    // normals should match up to floating point conversion
    for (let i = 0; i < 60; i += 1) {
      assert.ok(
        Math.abs(restored.attributes.normal.array[i] - geometry.attributes.normal.array[i]) < 1e-4,
      );
    }
    assert.ok(restored.boundingBox.min.y > -1);
  }
  assert.equal(unpackGeometry(null), null);
});
