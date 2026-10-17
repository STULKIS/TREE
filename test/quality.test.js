import test from 'node:test';
import assert from 'node:assert/strict';
import { makeParams } from '../src/generator/params.js';
import { generateTree } from '../src/generator/tree.js';

test('generation stays within an interactive budget for every preset', () => {
  for (const species of ['oak', 'maple', 'birch', 'willow', 'pine', 'blossom']) {
    const tree = generateTree(makeParams(species, 4815));
    assert.ok(tree.stats.triangles < 260000, `${species} exceeds the triangle budget`);
    assert.ok(tree.stats.leaves <= 32000, `${species} exceeds the leaf budget`);
    assert.ok(tree.stats.triangles > 20000, `${species} is suspiciously sparse`);
  }
});

test('every species survives a bare-leaf pass and deep recursion', async () => {
  const { SPECIES } = await import('../src/generator/params.js');
  for (const species of SPECIES) {
    for (const style of ['broad', 'slender', 'needle', 'none']) {
      const params = makeParams(species.id, 5150);
      params.leaves.style = style;
      params.branches.depth = 5;
      const tree = generateTree(params);
      assert.ok(tree.stats.triangles > 1000, `${species.id}/${style} produced no geometry`);
      if (style === 'none') {
        assert.equal(tree.stats.leaves, 0);
        assert.equal(tree.leafGeometry, null);
      } else {
        assert.ok(tree.stats.leaves > 100, `${species.id}/${style} lost its foliage`);
        assert.ok(tree.stats.leaves <= 32000, `${species.id}/${style} blew the leaf budget`);
      }
      const position = tree.barkGeometry.getAttribute('position').array;
      for (let i = 0; i < position.length; i += 1) {
        assert.ok(Number.isFinite(position[i]), `${species.id}/${style} has invalid geometry`);
      }
    }
  }
});
