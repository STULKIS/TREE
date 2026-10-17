import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA, PARAM_LIST, LIMITS, SPECIES, SPECIES_ORDER, sanitizeParams, sanitizeSeed, sanitizeDesign,
  presetParams, randomDesignFromRng, QUALITY, HARD_LIMITS,
} from '../src/generator/params.js';
import { createRng } from '../src/generator/rng.js';

test('schema exposes about forty parameters across grouped sections', () => {
  const total = PARAM_LIST.length + 1; // + seed
  assert.ok(total >= 38 && total <= 42, `got ${total}`);
  assert.ok(SCHEMA.length >= 4);
  const keys = PARAM_LIST.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate keys');
});

test('every species provides a complete, in-range parameter set', () => {
  assert.deepEqual(SPECIES_ORDER, ['oak', 'maple', 'birch', 'willow', 'pine', 'blossom']);
  for (const id of SPECIES_ORDER) {
    const clean = sanitizeParams(SPECIES[id].params, id);
    assert.deepEqual(clean, presetParams(id), `${id} preset is not already clean`);
    for (const spec of PARAM_LIST) {
      if (spec.type === 'number' || spec.type === 'integer') {
        const v = SPECIES[id].params[spec.key];
        assert.ok(v >= spec.min && v <= spec.max, `${id}.${spec.key}=${v} out of range`);
      }
    }
  }
});

test('leaf styles differ between species so silhouettes are distinct', () => {
  const styles = new Set(SPECIES_ORDER.map((id) => SPECIES[id].params.leafStyle));
  assert.ok(styles.size >= 4);
  assert.ok(SPECIES_ORDER.some((id) => SPECIES[id].params.leafStyle === 'needle'));
});

test('hostile numbers are clamped, quantised or replaced by the preset', () => {
  const hostile = {
    height: 1e308,
    trunkRadius: -Infinity,
    trunkTaper: NaN,
    depth: 99.7,
    children: '4.2',
    branchAngle: '  ',
    leafCap: 'Infinity',
    sides: [1, 2],
    segments: { a: 1 },
    gnarl: '0.5',
    leafSize: 0.1234,
  };
  const out = sanitizeParams(hostile, 'oak');
  assert.equal(out.height, LIMITS.height.max);
  assert.equal(out.trunkRadius, SPECIES.oak.params.trunkRadius);
  assert.equal(out.trunkTaper, SPECIES.oak.params.trunkTaper);
  assert.equal(out.depth, 7);
  assert.equal(out.children, 4);
  assert.equal(out.branchAngle, SPECIES.oak.params.branchAngle);
  assert.equal(out.leafCap, SPECIES.oak.params.leafCap);
  assert.equal(out.sides, SPECIES.oak.params.sides);
  assert.equal(out.segments, SPECIES.oak.params.segments);
  assert.equal(out.gnarl, 0.5);
  assert.equal(out.leafSize, 0.12);
  for (const spec of PARAM_LIST) {
    if (spec.type === 'integer') assert.equal(Math.round(out[spec.key]), out[spec.key]);
  }
});

test('colours and choices are whitelisted', () => {
  const out = sanitizeParams({ barkColor: 'javascript:alert(1)', leafColor: '#ABCDEF', leafStyle: '<img>', flowerColor: 'fff' }, 'pine');
  assert.equal(out.barkColor, SPECIES.pine.params.barkColor);
  assert.equal(out.leafColor, '#abcdef');
  assert.equal(out.leafStyle, SPECIES.pine.params.leafStyle);
  assert.equal(out.flowerColor, '#fff'.length === 4 ? SPECIES.pine.params.flowerColor : '');
});

test('prototype pollution keys are ignored', () => {
  const raw = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1},"height":5}');
  const out = sanitizeParams(raw, 'oak');
  assert.equal(Object.hasOwn(out, '__proto__'), false);
  assert.equal(out.height, 5);
  assert.equal(({}).polluted, undefined);
});

test('seeds fold to unsigned 32-bit integers deterministically', () => {
  assert.equal(sanitizeSeed(42), 42);
  assert.equal(sanitizeSeed('12'), 12);
  assert.equal(sanitizeSeed(-1), 4294967295);
  assert.equal(sanitizeSeed(4294967296 + 5), 5);
  assert.equal(sanitizeSeed(2.9), 2);
  assert.equal(sanitizeSeed('nope', 7), 7);
  assert.equal(sanitizeSeed(NaN, 3), 3);
  assert.equal(sanitizeSeed(1e400, 3), 3);
});

test('unknown species fall back to oak; nulls and arrays never crash', () => {
  assert.equal(sanitizeDesign({ species: '__proto__' }).species, 'oak');
  assert.equal(sanitizeDesign({ species: 'toString' }).species, 'oak');
  assert.equal(sanitizeDesign(null).species, 'oak');
  assert.equal(sanitizeDesign([1, 2]).seed, 1);
  assert.equal(sanitizeDesign({ species: 'pine', seed: 9 }).params.height, SPECIES.pine.params.height);
});

test('random designs from the surprise roller are always valid', () => {
  const rng = createRng(5);
  for (let i = 0; i < 50; i++) {
    const d = randomDesignFromRng(rng);
    assert.deepEqual(sanitizeDesign(d), d);
  }
});

test('quality tiers respect the product budgets', () => {
  assert.ok(QUALITY.studio.maxBarkTris + QUALITY.studio.foliageTriBudget <= HARD_LIMITS.studioTriangles);
  assert.ok(QUALITY.software.maxBarkTris + QUALITY.software.foliageTriBudget <= HARD_LIMITS.softwareTriangles);
  assert.ok(QUALITY.preview.maxBarkTris + QUALITY.preview.foliageTriBudget < QUALITY.studio.maxBarkTris + QUALITY.studio.foliageTriBudget);
});
