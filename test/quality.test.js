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
