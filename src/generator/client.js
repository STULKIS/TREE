/**
 * Generator client: runs generation in a Web Worker (falling back to the main
 * thread when `Worker` is unavailable or the worker fails to boot), coalesces
 * requests so at most one build is ever in flight, and debounces slider edits.
 */
import { generateTree } from './tree.js';

export class GeneratorClient {
  /**
   * @param {object} [options]
   * @param {boolean} [options.useWorker=true]
   * @param {number}  [options.debounceMs=40]
   * @param {Function} [options.createWorker] custom worker factory (tests)
   */
  constructor(options = {}) {
    this.debounceMs = options.debounceMs ?? 40;
    this.worker = null;
    this.mode = 'main';
    this.nextId = 1;
    this.inflight = null; // { id, resolve, reject }
    this.pending = null; // { design, quality, resolve, reject }
    this.timer = null;
    this.listeners = new Set();
    const wantWorker = options.useWorker !== false && (typeof options.createWorker === 'function' || typeof Worker !== 'undefined');
    if (wantWorker) {
      try {
        this.worker = options.createWorker
          ? options.createWorker()
          : new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this.onMessage(e.data);
        this.worker.onerror = (e) => this.onWorkerError(e);
        this.mode = 'worker';
      } catch (err) {
        this.worker = null;
        this.mode = 'main';
      }
    }
  }

  /** Subscribe to `{ type: 'busy' | 'idle' }` events. */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners) fn({ type, ...detail });
  }

  onWorkerError(e) {
    // Worker died or failed to load: fall back to the main thread and replay the in-flight job.
    const job = this.inflight;
    this.teardownWorker();
    if (job) {
      this.inflight = null;
      this.runOnMain(job.design, job.quality).then(job.resolve, job.reject).finally(() => this.drain());
    }
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  }

  teardownWorker() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        /* ignore */
      }
    }
    this.worker = null;
    this.mode = 'main';
  }

  onMessage(msg) {
    const job = this.inflight;
    if (!job || !msg || msg.id !== job.id) return;
    this.inflight = null;
    if (msg.ok) job.resolve(msg.tree);
    else job.reject(new Error(msg.error || 'Generation failed'));
    this.drain();
  }

  async runOnMain(design, quality) {
    // Yield once so the UI can paint before a heavy synchronous build.
    await new Promise((r) => setTimeout(r, 0));
    return generateTree(design, quality);
  }

  /**
   * Request a build. If another build is in flight the request is queued, and
   * any previously queued (not yet started) request is superseded.
   * @returns {Promise<object>} resolves with the tree, or rejects with
   *   `{ superseded: true }` when a newer request replaced it.
   */
  request(design, quality = 'studio') {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        const old = this.pending;
        this.pending = null;
        old.reject(superseded());
      }
      this.pending = { design: cloneDesign(design), quality, resolve, reject };
      if (!this.inflight) this.drain();
    });
  }

  /** Debounced variant for slider drags. */
  requestDebounced(design, quality = 'studio', ms = this.debounceMs) {
    if (this.timer) clearTimeout(this.timer);
    if (this.debouncedReject) {
      this.debouncedReject(superseded());
      this.debouncedReject = null;
    }
    return new Promise((resolve, reject) => {
      this.debouncedReject = reject;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.debouncedReject = null;
        this.request(design, quality).then(resolve, reject);
      }, ms);
    });
  }

  drain() {
    if (this.inflight || !this.pending) {
      if (!this.inflight && !this.pending) this.emit('idle');
      return;
    }
    const job = this.pending;
    this.pending = null;
    const id = this.nextId++;
    this.inflight = { id, resolve: job.resolve, reject: job.reject, design: job.design, quality: job.quality };
    this.emit('busy');
    if (this.worker) {
      try {
        this.worker.postMessage({ id, design: job.design, quality: job.quality });
        return;
      } catch (err) {
        this.teardownWorker();
      }
    }
    this.runOnMain(job.design, job.quality).then(
      (tree) => {
        if (this.inflight && this.inflight.id === id) {
          this.inflight = null;
          job.resolve(tree);
          this.drain();
        }
      },
      (err) => {
        if (this.inflight && this.inflight.id === id) {
          this.inflight = null;
          job.reject(err);
          this.drain();
        }
      }
    );
  }

  get busy() {
    return Boolean(this.inflight || this.pending || this.timer);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.teardownWorker();
    this.listeners.clear();
  }
}

function superseded() {
  const e = new Error('superseded');
  e.superseded = true;
  return e;
}

function cloneDesign(d) {
  return { species: d.species, seed: d.seed, params: { ...(d.params || {}) } };
}

export function isSuperseded(err) {
  return Boolean(err && err.superseded);
}
