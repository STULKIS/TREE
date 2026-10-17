import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash } from '../src/ui/permalink.js';

test('share hashes round-trip species and seed', () => {
  for (const species of ['oak', 'maple', 'birch', 'willow', 'pine', 'blossom']) {
    for (const seed of [1, 4815, 99999, 123456789]) {
      assert.deepEqual(parseHash(buildHash(species, seed)), { species, seed });
    }
  }
});

test('hashes are tolerant and reject foreign fragments', () => {
  assert.deepEqual(parseHash('#OAK-4815'), { species: 'oak', seed: 4815 });
  assert.deepEqual(parseHash('pine-7'), { species: 'pine', seed: 7 });
  assert.deepEqual(parseHash('  #willow-42  '), { species: 'willow', seed: 42 });
  assert.equal(parseHash(''), null);
  assert.equal(parseHash('#'), null);
  assert.equal(parseHash('#baobab-12'), null);
  assert.equal(parseHash('#oak-0'), null);
  assert.equal(parseHash('#oak--12'), null);
  assert.equal(parseHash('#oak'), null);
  assert.equal(parseHash('#oak-1234567890'), null);
  assert.equal(parseHash(null), null);
});
