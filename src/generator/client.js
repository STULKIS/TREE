// Generation client. Interactive requests are latest-wins with at most one build in flight;
// bulk requests (exports, thumbnails) run in their own lane and are never superseded.
import { buildTree } from './geometry.js';
import { sanitizeDesign } from './params.js';

/**
 * @param {object} [opts]
 * @param {() => Worker} [opts.createWorker]  factory; omit or throw to use the main thread
 */
export function createGenerator({ createWorker = null } = {}) {
  let worker = null;
  let mode = createWorker ? 'worker' : 'main';
  let seq = 0;
  const waiting = new Map(); // id -> { resolve, reject }
  let interactive = { inflight: null, pending: null };

  function ensureWorker() {
    if (mode !== 'worker') return null;
    if (worker) return worker;
    try {
      worker = createWorker();
      worker.onmessage = (ev) => {
        const entry = waiting.get(ev.data && ev.data.id);
        if (!entry) return;
        waiting.delete(ev.data.id);
        if (ev.data.ok) entry.resolve({ design: ev.data.design, result: ev.data.result });
        else entry.reject(new Error(ev.data.error || 'Generation failed'));
      };
      worker.onerror = () => {
        // A crashing worker degrades to the main thread; in-flight jobs are retried there.
        const stranded = [...waiting.entries()];
        waiting.clear();
        mode = 'main';
        try { worker.terminate(); } catch { /* already gone */ }
        worker = null;
        for (const [, entry] of stranded) entry.retry?.();
      };
      return worker;
    } catch {
      mode = 'main';
      worker = null;
      return null;
    }
  }

  function runOnWorker(design, quality) {
    const w = ensureWorker();
    if (!w) return null;
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        retry: () => runOnMain(design, quality).then(resolve, reject),
      };
      waiting.set(id, entry);
      try {
        w.postMessage({ id, design, quality });
      } catch (err) {
        waiting.delete(id);
        reject(err);
      }
    });
  }

  async function runOnMain(design, quality) {
    const clean = sanitizeDesign(design);
    return { design: clean, result: buildTree(clean, quality) };
  }

  async function run(design, quality) {
    const pending = runOnWorker(design, quality);
    if (pending) return pending;
    return runOnMain(design, quality);
  }

  function pump() {
    if (interactive.inflight || !interactive.pending) return;
    const job = interactive.pending;
    interactive.pending = null;
    interactive.inflight = job;
    run(job.design, job.quality).then(
      (out) => { interactive.inflight = null; job.resolve(out); pump(); },
      (err) => { interactive.inflight = null; job.reject(err); pump(); },
    );
  }

  return {
    get mode() { return mode; },

    /**
     * Interactive build. A newer request supersedes an older queued one: the older promise
     * resolves to `null` so callers can ignore stale output.
     */
    request(design, quality = 'studio') {
      return new Promise((resolve, reject) => {
        if (interactive.pending) interactive.pending.resolve(null);
        interactive.pending = { design: structuredClone(design), quality, resolve, reject };
        pump();
      });
    },

    /** Non-superseding build for exports and thumbnails. */
    build(design, quality = 'studio') {
      return run(structuredClone(design), quality);
    },

    terminate() {
      if (worker) worker.terminate();
      worker = null;
      waiting.clear();
    },
  };
}
