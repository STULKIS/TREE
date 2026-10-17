/**
 * Runs the real browser worker module inside a Node worker_thread by shimming
 * `self.onmessage` / `self.postMessage` onto `parentPort`.
 */
import { parentPort } from 'node:worker_threads';

globalThis.self = globalThis;
globalThis.postMessage = (msg, transfer) => parentPort.postMessage(msg, transfer);
await import('../../src/generator/worker.js');
parentPort.on('message', (data) => globalThis.onmessage({ data }));
