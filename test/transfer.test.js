import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { GeneratorClient, isSuperseded } from '../src/generator/client.js';
import { generateTree } from '../src/generator/tree.js';
import { transferablesOf } from '../src/generator/mesh.js';

const workerPath = fileURLToPath(new URL('./helpers/node-worker.js', import.meta.url));

/** Adapt a node worker_thread to the browser Worker surface used by the client. */
function createNodeWorker() {
  const w = new Worker(workerPath, { type: 'module' });
  const adapter = {
    onmessage: null,
    onerror: null,
    postMessage: (msg) => w.postMessage(msg),
    terminate: () => w.terminate()
  };
  w.on('message', (data) => adapter.onmessage && adapter.onmessage({ data }));
  w.on('error', (err) => adapter.onerror && adapter.onerror(err));
  return adapter;
}

test('typed arrays survive a transfer round-trip through the real worker module', async () => {
  const client = new GeneratorClient({ createWorker: createNodeWorker, useWorker: true });
  assert.equal(client.mode, 'worker');
  try {
    const design = { species: 'maple', seed: 77, params: { height: 9 } };
    const viaWorker = await client.request(design, 'preview');
    const direct = generateTree(design, 'preview');
    {
      assert.ok(viaWorker.bark.positions instanceof Float32Array);
      assert.ok(viaWorker.bark.indices instanceof Uint16Array || viaWorker.bark.indices instanceof Uint32Array);
      assert.deepEqual(Array.from(viaWorker.bark.positions), Array.from(direct.bark.positions));
      assert.deepEqual(Array.from(viaWorker.foliage.indices), Array.from(direct.foliage.indices));
      assert.deepEqual(viaWorker.bounds, direct.bounds);
      assert.equal(viaWorker.stats.triangles, direct.stats.triangles);
      assert.equal(viaWorker.foliage.cardTriangles, direct.foliage.cardTriangles);
    }
  } finally {
    client.dispose();
  }
});

test('transferables detach the source buffers (zero-copy) and structuredClone keeps the data', () => {
  const tree = generateTree({ species: 'pine', seed: 3, params: {} }, 'software');
  const transfer = [...transferablesOf(tree.bark), ...transferablesOf(tree.foliage)];
  assert.equal(transfer.length, 10);
  const tris = tree.stats.triangles;
  const clone = structuredClone(tree, { transfer });
  assert.equal(tree.bark.positions.byteLength, 0, 'source buffer should be detached');
  assert.equal(clone.bark.indices.length / 3 + clone.foliage.indices.length / 3, tris);
  assert.ok(clone.bark.positions instanceof Float32Array);
});

test('main-thread fallback coalesces: at most one in-flight build, newer requests supersede queued ones', async () => {
  const client = new GeneratorClient({ useWorker: false, debounceMs: 5 });
  assert.equal(client.mode, 'main');
  const results = await Promise.allSettled([
    client.request({ species: 'oak', seed: 1, params: {} }, 'software'),
    client.request({ species: 'oak', seed: 2, params: {} }, 'software'),
    client.request({ species: 'oak', seed: 3, params: {} }, 'software')
  ]);
  // First runs, second is superseded by the third
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.ok(isSuperseded(results[1].reason));
  assert.equal(results[2].status, 'fulfilled');
  assert.equal(results[2].value.seed, 3);

  const debounced = await Promise.allSettled([
    client.requestDebounced({ species: 'birch', seed: 1, params: {} }, 'software'),
    client.requestDebounced({ species: 'birch', seed: 2, params: {} }, 'software')
  ]);
  assert.equal(debounced[0].status, 'rejected');
  assert.equal(debounced[1].status, 'fulfilled');
  assert.equal(debounced[1].value.seed, 2);
  assert.equal(client.busy, false);
  client.dispose();
});

test('a worker that throws on boot falls back to the main thread', async () => {
  const client = new GeneratorClient({
    useWorker: true,
    createWorker: () => {
      throw new Error('no workers here');
    }
  });
  assert.equal(client.mode, 'main');
  const tree = await client.request({ species: 'oak', seed: 1, params: {} }, 'software');
  assert.ok(tree.stats.triangles > 0);
  client.dispose();
});

test('a worker that errors mid-flight is replaced by the main thread and the job still resolves', async () => {
  const fake = { onmessage: null, onerror: null, postMessage() { setTimeout(() => this.onerror && this.onerror({ message: 'boom', preventDefault() {} }), 1); }, terminate() {} };
  const client = new GeneratorClient({ useWorker: true, createWorker: () => fake });
  const tree = await client.request({ species: 'oak', seed: 9, params: {} }, 'software');
  assert.equal(client.mode, 'main');
  assert.equal(tree.seed, 9);
  client.dispose();
});
