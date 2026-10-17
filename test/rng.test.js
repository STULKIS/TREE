import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, normalizeSeed, hashString, mixSeed } from '../src/generator/rng.js';

test('same seed yields identical sequences', () => {
  const a = new Rng(1234);
  const b = new Rng(1234);
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = new Rng(1);
  const b = new Rng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 3);
});

test('values are uniform in [0,1) and helpers respect ranges', () => {
  const r = new Rng('oak-7');
  let sum = 0;
  for (let i = 0; i < 20000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.02);
  for (let i = 0; i < 500; i++) {
    const n = r.int(3, 7);
    assert.ok(n >= 3 && n <= 7 && Number.isInteger(n));
    const j = r.jitter(0.5);
    assert.ok(j >= -0.5 && j <= 0.5);
  }
});

test('seed normalisation handles strings, numbers and garbage', () => {
  assert.equal(normalizeSeed(42), 42);
  assert.equal(normalizeSeed('42'), 42);
  assert.equal(normalizeSeed(-42.9), 42);
  assert.equal(normalizeSeed('willow'), hashString('willow'));
  assert.equal(normalizeSeed(NaN), 1);
  assert.equal(normalizeSeed(undefined), 1);
  assert.notEqual(hashString('a'), hashString('b'));
  assert.notEqual(mixSeed(1, 2), mixSeed(2, 1));
});

test('forked generators are deterministic and independent', () => {
  const a = new Rng(9).fork(3);
  const b = new Rng(9).fork(3);
  const c = new Rng(9).fork(4);
  assert.equal(a.next(), b.next());
  assert.notEqual(a.next(), c.next());
});
