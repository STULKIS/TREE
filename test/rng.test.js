import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRng, hashSeed } from '../src/generator/rng.js';
import { ROOT } from './helpers.js';

test('same seed yields the same stream; different seeds diverge', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const sa = Array.from({ length: 64 }, () => a.next());
  const sb = Array.from({ length: 64 }, () => b.next());
  const sc = Array.from({ length: 64 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('values stay in [0,1) and are roughly uniform', () => {
  const r = createRng(7);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    buckets[Math.floor(v * 10)]++;
  }
  for (const n of buckets) assert.ok(n > 1700 && n < 2300, `bucket skew ${n}`);
});

test('hashSeed spreads adjacent seeds apart', () => {
  const set = new Set();
  for (let i = 0; i < 1000; i++) set.add(hashSeed(i));
  assert.equal(set.size, 1000);
});

test('Math.random is banned in shipped source', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|css|html)$/.test(name) && /Math\.random\(/.test(readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(offenders, []);
});
