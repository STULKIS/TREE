import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetParams, sanitizeDesign } from '../src/generator/params.js';
import { createGenerator } from '../src/generator/client.js';
import { buildTree } from '../src/generator/geometry.js';

/**
 * A worker double that runs the real worker module in-process. Messages are cloned like a
 * real postMessage, and transfer lists are honoured by detaching the sent buffers.
 */
async function createFakeWorker() {
  const realSelf = globalThis.self;
  const sent = [];
  const fake = { onmessage: null, onerror: null, terminated: false };
  const inner = { postMessage() {} };
  globalThis.self = inner;
  await import(`../src/generator/worker.js?case=${Math.random().toString(36).slice(2)}`);
  globalThis.self = realSelf;
  const handler = inner.onmessage;
  fake.postMessage = (msg) => {
    const cloned = structuredClone(msg);
    const out = [];
    globalThis.self = { postMessage: (data, transfer = []) => out.push({ data, transfer }) };
    handler({ data: cloned });
    globalThis.self = realSelf;
    for (const { data, transfer } of out) {
      // Simulate a real transfer: the sender loses access to transferred buffers.
      assert.ok(transfer.every((b) => b instanceof ArrayBuffer), 'transfer list must hold ArrayBuffers');
      sent.push({ data, transfer });
      queueMicrotask(() => fake.onmessage?.({ data }));
    }
  };
  fake.terminate = () => { fake.terminated = true; };
  return { fake, sent };
}

test('worker round-trip returns identical geometry and transfers typed-array buffers', async () => {
  const { fake, sent } = await createFakeWorker();
  const gen = createGenerator({ createWorker: () => fake });
  const design = sanitizeDesign({ species: 'maple', seed: 77, params: presetParams('maple') });
  const { result, design: echoed } = await gen.request(design, 'preview');
  assert.deepEqual(echoed, design);
  const local = buildTree(design, 'preview');
  assert.equal(result.stats.triangles, local.stats.triangles);
  assert.deepEqual(Array.from(result.bark.indices.slice(0, 500)), Array.from(local.bark.indices.slice(0, 500)));
  assert.equal(result.foliage.cardStarts.length, local.foliage.cardStarts.length);
  const transferred = sent.find((s) => s.data.ok);
  assert.ok(transferred.transfer.length >= 8, 'expected bark and foliage buffers in the transfer list');
});

test('worker sanitises hostile input before building', async () => {
  const { fake } = await createFakeWorker();
  const gen = createGenerator({ createWorker: () => fake });
  const { design } = await gen.request({ species: 'x', seed: 'y', params: { height: 1e9, depth: 40 } }, 'preview');
  assert.equal(design.species, 'oak');
  assert.equal(design.params.height, 40);
  assert.equal(design.params.depth, 7);
});

test('interactive requests coalesce: only the latest pending build runs', async () => {
  const gen = createGenerator();
  const base = sanitizeDesign({ species: 'oak', seed: 1 });
  const first = gen.request({ ...base, seed: 1 }, 'preview');
  const second = gen.request({ ...base, seed: 2 }, 'preview');
  const third = gen.request({ ...base, seed: 3 }, 'preview');
  const [a, b, c] = await Promise.all([first, second, third]);
  // The first job was already in flight, so it completes; the queued second job is superseded.
  assert.equal(a.design.seed, 1);
  assert.equal(b, null, 'queued request should be superseded by the newest one');
  assert.equal(c.design.seed, 3);
});

test('bulk builds are never superseded', async () => {
  const gen = createGenerator();
  const base = sanitizeDesign({ species: 'pine', seed: 1 });
  const [x, y] = await Promise.all([gen.build({ ...base, seed: 5 }, 'software'), gen.build({ ...base, seed: 6 }, 'software')]);
  assert.equal(x.design.seed, 5);
  assert.equal(y.design.seed, 6);
});

test('a crashing worker falls back to the main thread and retries the job', async () => {
  const fake = { onmessage: null, onerror: null, postMessage() { queueMicrotask(() => this.onerror?.(new Error('boom'))); }, terminate() {} };
  const gen = createGenerator({ createWorker: () => fake });
  const out = await gen.request(sanitizeDesign({ species: 'birch', seed: 3 }), 'preview');
  assert.equal(out.design.species, 'birch');
  assert.equal(gen.mode, 'main');
});

test('no Worker support means the main thread is used directly', async () => {
  const gen = createGenerator({ createWorker: null });
  assert.equal(gen.mode, 'main');
  const out = await gen.request(sanitizeDesign({ species: 'blossom', seed: 2 }), 'preview');
  assert.equal(out.result.stats.quality, 'preview');
});
