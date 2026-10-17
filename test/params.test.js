import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA, LIMITS, SPECIES, SPECIES_IDS, sanitizeParams, sanitizeDesign, sanitizeValue, sanitizeSeed,
  presetParams, diffFromPreset, sanitizeColor, DEFAULTS
} from '../src/generator/params.js';

test('schema exposes ~40 grouped parameters with unique keys', () => {
  const keys = new Set(SCHEMA.map((s) => s.key));
  assert.equal(keys.size, SCHEMA.length);
  assert.ok(SCHEMA.length >= 38 && SCHEMA.length <= 48, `got ${SCHEMA.length}`);
  for (const def of SCHEMA) {
    assert.ok(def.group && def.label && def.type);
    if (def.type === 'number' || def.type === 'int') {
      assert.ok(def.min < def.max);
      assert.ok(def.step > 0);
      assert.ok(def.default >= def.min && def.default <= def.max, def.key);
      assert.deepEqual(LIMITS[def.key], { min: def.min, max: def.max });
    }
  }
});

test('every species is a complete, in-range parameter set', () => {
  assert.deepEqual(SPECIES_IDS, ['oak', 'maple', 'birch', 'willow', 'pine', 'blossom']);
  for (const id of SPECIES_IDS) {
    const p = SPECIES[id].params;
    for (const def of SCHEMA) {
      assert.ok(def.key in p, `${id} missing ${def.key}`);
      assert.equal(sanitizeValue(def.key, p[def.key]), p[def.key], `${id}.${def.key} out of range`);
    }
    assert.deepEqual(sanitizeParams(presetParams(id), id), presetParams(id));
  }
});

test('hostile input is clamped, coerced or replaced', () => {
  const hostile = {
    height: 1e9,
    radius: -5,
    depth: '99',
    children: 'NaN',
    angle: Infinity,
    taper: { evil: true },
    leafStyle: '<script>',
    barkColor: 'javascript:alert(1)',
    leafColor: 'abc',
    leafTipColor: '#ZZZZZZ',
    trunkSides: 3.7,
    startOffset: 0.9,
    endOffset: 0.1,
    leafStartDepth: 7,
    __proto__: { polluted: true },
    unknownKey: 5
  };
  const p = sanitizeParams(hostile, 'oak');
  assert.equal(p.height, LIMITS.height.max);
  assert.equal(p.radius, LIMITS.radius.min);
  assert.equal(p.depth, 7);
  assert.equal(p.children, presetParams('oak').children);
  assert.equal(p.angle, LIMITS.angle.max);
  assert.equal(p.taper, presetParams('oak').taper);
  assert.equal(p.leafStyle, 'broad');
  assert.equal(p.barkColor, presetParams('oak').barkColor);
  assert.equal(p.leafColor, '#aabbcc');
  assert.equal(p.leafTipColor, presetParams('oak').leafTipColor);
  assert.equal(p.trunkSides, 4);
  assert.ok(p.endOffset > p.startOffset);
  assert.ok(p.leafStartDepth <= p.depth);
  assert.ok(!('unknownKey' in p));
  assert.ok(!('polluted' in p));
  assert.equal(Object.keys(p).length, SCHEMA.length);
});

test('non-object params fall back to the preset', () => {
  assert.deepEqual(sanitizeParams(null, 'pine'), presetParams('pine'));
  assert.deepEqual(sanitizeParams('garbage', 'pine'), presetParams('pine'));
  assert.deepEqual(sanitizeParams([1, 2, 3], 'pine'), presetParams('pine'));
  assert.deepEqual(sanitizeParams(undefined, 'nope'), { ...DEFAULTS, ...SPECIES.oak.params });
});

test('design sanitiser normalises species and seed', () => {
  const d = sanitizeDesign({ species: 'cactus', seed: '-12.7', params: { height: 3 } });
  assert.equal(d.species, 'oak');
  assert.equal(d.seed, 12);
  assert.equal(d.params.height, 3);
  assert.equal(sanitizeSeed('x'.repeat(500)).length, 64);
  assert.equal(sanitizeSeed(0), 1);
  assert.equal(sanitizeSeed(2 ** 40), LIMITS.seed.max);
  assert.equal(sanitizeSeed(null, 5), 5);
  assert.equal(sanitizeDesign(null).species, 'oak');
});

test('colours accept 3 and 6 digit hex only', () => {
  assert.equal(sanitizeColor('#ABCDEF', '#000000'), '#abcdef');
  assert.equal(sanitizeColor('fff', '#000000'), '#ffffff');
  assert.equal(sanitizeColor('rgb(1,2,3)', '#000000'), '#000000');
  assert.equal(sanitizeColor(42, '#000000'), '#000000');
});

test('diffFromPreset only reports changed keys', () => {
  const p = { ...presetParams('birch'), height: 20, gnarl: 0.9 };
  assert.deepEqual(diffFromPreset(p, 'birch'), { height: 20, gnarl: 0.9 });
  assert.deepEqual(diffFromPreset(presetParams('birch'), 'birch'), {});
});
