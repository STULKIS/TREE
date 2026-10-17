import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeHash, decodeHash } from '../src/ui/permalink.js';
import { presetParams, sanitizeDesign } from '../src/generator/params.js';

test('round-trip restores species, seed and every changed slider exactly', () => {
  const d = sanitizeDesign({ species: 'willow', seed: 4294967295, params: { ...presetParams('willow'), height: 12.5, barkColor: '#ABCDEF', leafStyle: 'needle', trunkLean: -7.5 } });
  const hash = encodeHash(d);
  assert.ok(hash.startsWith('#species=willow&seed=4294967295'));
  assert.deepEqual(decodeHash(hash), d);
});

test('only changed parameters are written, keeping links short', () => {
  const d = sanitizeDesign({ species: 'oak', seed: 3 });
  assert.equal(encodeHash(d), '#species=oak&seed=3');
});

test('whitespace and a leading hash are trimmed', () => {
  const d = decodeHash('  #  species = pine & seed= 77 & height=  7.33  &  sides = 99 ');
  assert.equal(d.species, 'pine');
  assert.equal(d.seed, 77);
  assert.equal(d.params.height, 7.3);
  assert.equal(d.params.sides, 12);
});

test('bad hashes never throw and fall back safely', () => {
  assert.equal(decodeHash('#%E0%A4%A'), null, 'malformed percent-encoding');
  assert.equal(decodeHash(''), null);
  assert.equal(decodeHash('#'), null);
  assert.equal(decodeHash('#nothing=here'), null);
  assert.equal(decodeHash(undefined), null);
  assert.equal(decodeHash(42), null);
  const junk = decodeHash('#species=evil&seed=abc&height=huge&leafCap=-1&__proto__=x');
  assert.equal(junk.species, 'oak');
  assert.equal(junk.seed, 1);
  assert.equal(junk.params.height, presetParams('oak').height);
  assert.equal(junk.params.leafCap, 500);
});

test('unknown keys are ignored and never leak into the design', () => {
  const d = decodeHash('#species=birch&seed=5&evil=1&constructor=2');
  assert.equal(Object.hasOwn(d, 'evil'), false);
  assert.deepEqual(Object.keys(d).sort(), ['params', 'seed', 'species']);
});
