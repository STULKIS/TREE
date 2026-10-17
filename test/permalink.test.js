import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeHash, decodeHash, shareUrl } from '../src/ui/permalink.js';
import { presetParams, sanitizeDesign } from '../src/generator/params.js';
import { buildDesignJson, parseDesignJson } from '../src/export/design.js';

test('share links round-trip species, seed and every changed parameter', () => {
  const params = { ...presetParams('willow'), height: 17.3, gnarl: 0.91, leafStyle: 'needle', barkColor: '#123abc', depth: 6 };
  const design = { species: 'willow', seed: 424242, params };
  const hash = encodeHash(design);
  assert.ok(hash.startsWith('#s=willow&seed=424242'));
  const back = decodeHash(hash);
  assert.deepEqual(back, sanitizeDesign(design));
  assert.equal(back.params.height, 17.3);
  assert.equal(back.params.barkColor, '#123abc');
});

test('links are trimmed to the diff from the preset', () => {
  const hash = encodeHash({ species: 'pine', seed: 3, params: presetParams('pine') });
  assert.equal(hash, '#s=pine&seed=3');
  const one = encodeHash({ species: 'pine', seed: 3, params: { ...presetParams('pine'), angle: 90 } });
  assert.equal(one, '#s=pine&seed=3&angle=90');
});

test('bad, hostile and empty hashes degrade gracefully', () => {
  assert.equal(decodeHash(''), null);
  assert.equal(decodeHash('#'), null);
  assert.equal(decodeHash('#section-2'), null);
  assert.equal(decodeHash(undefined), null);
  const junk = decodeHash('#s=dragon&seed=abc&height=9999&depth=-3&leafStyle=lava&barkColor=zzzzzz&evil=1&__proto__=x');
  assert.equal(junk.species, 'oak');
  assert.equal(junk.seed, 'abc');
  assert.equal(junk.params.height, 40);
  assert.equal(junk.params.depth, 1);
  assert.equal(junk.params.leafStyle, 'broad');
  assert.equal(junk.params.barkColor, presetParams('oak').barkColor);
  assert.ok(!('evil' in junk.params));
  const huge = decodeHash('#s=oak&seed=1&' + 'x'.repeat(100000));
  assert.equal(huge.species, 'oak');
  const seedOnly = decodeHash('#seed=55');
  assert.equal(seedOnly.seed, 55);
  assert.equal(seedOnly.species, 'oak');
});

test('shareUrl builds an absolute URL with the hash', () => {
  const url = shareUrl({ species: 'oak', seed: 1, params: {} }, { origin: 'https://example.com', pathname: '/sapling/', search: '' });
  assert.equal(url, 'https://example.com/sapling/#s=oak&seed=1');
});

test('design JSON import uses the same sanitiser as share links', () => {
  const json = buildDesignJson({ species: 'maple', seed: 9, params: { height: 99, gnarl: 'bad' } }, { triangles: 1 });
  const parsed = JSON.parse(json);
  assert.equal(parsed.format, 'sapling-design');
  assert.equal(parsed.params.height, 40);
  const back = parseDesignJson(json);
  assert.deepEqual(back, decodeHash(encodeHash(back)));
  assert.throws(() => parseDesignJson('{not json'), /valid JSON/);
  assert.throws(() => parseDesignJson('{"format":"other"}'), /Unknown design format/);
  assert.equal(parseDesignJson('{"species":"nope"}').species, 'oak');
});
