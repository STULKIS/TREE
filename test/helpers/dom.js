/**
 * jsdom bootstrap shared by the UI tests. Loads the real index.html, installs
 * the globals the app touches, and returns a stage stub factory.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const INDEX_HTML = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

export function createDom({ url = 'http://localhost/', hash = '' } = {}) {
  const virtualConsole = new VirtualConsole();
  // jsdom logs "Not implemented: HTMLCanvasElement.prototype.getContext" — expected, silence it.
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(INDEX_HTML, { url: url + hash, pretendToBeVisual: true, virtualConsole });
  const win = dom.window;
  win.__SAPLING_NO_AUTOBOOT__ = true;
  if (!win.matchMedia) {
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  }
  if (!win.ResizeObserver) {
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!win.requestIdleCallback) win.requestIdleCallback = (fn) => setTimeout(fn, 0);
  win.URL.createObjectURL = win.URL.createObjectURL || (() => 'blob:mock');
  win.URL.revokeObjectURL = win.URL.revokeObjectURL || (() => {});
  win.HTMLAnchorElement.prototype.click = function click() {
    win.__downloads = win.__downloads || [];
    win.__downloads.push({ href: this.href, download: this.download });
  };
  // Expose globals the app and three.js expect
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.HTMLCanvasElement = win.HTMLCanvasElement;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.Event = win.Event;
  globalThis.Blob = win.Blob;
  globalThis.File = win.File;
  globalThis.FileReader = win.FileReader;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
  globalThis.ResizeObserver = win.ResizeObserver;
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  return dom;
}

/** A stage stub recording calls, standing in for render/stage.js. */
export function createStageStub(record = []) {
  const stage = {
    record,
    tree: null,
    wind: null,
    turntable: null,
    disposed: false,
    frames: 0,
    setTree(tree, opts) {
      this.tree = tree;
      record.push(['setTree', tree.quality, opts]);
    },
    setWind(on) {
      this.wind = on;
      record.push(['setWind', on]);
    },
    setTurntable(on) {
      this.turntable = on;
      record.push(['setTurntable', on]);
    },
    resetCamera() {
      this.frames++;
      record.push(['resetCamera']);
    },
    snapshot() {
      record.push(['snapshot']);
      return this.canvas;
    },
    dispose() {
      this.disposed = true;
      record.push(['dispose']);
    }
  };
  return (opts) => {
    stage.canvas = opts.canvas;
    stage.opts = opts;
    record.push(['create']);
    return stage;
  };
}

/** A probe stub that succeeds, returning a fake context on a fresh canvas. */
export function okProbe(createCanvas) {
  const canvas = createCanvas();
  return {
    ok: true,
    canvas,
    context: { fake: true, isContextLost: () => false },
    attrs: { antialias: true },
    attempts: [{ label: 'stub', result: 'ok' }],
    reason: ''
  };
}

export function failProbe() {
  return {
    ok: false,
    canvas: null,
    context: null,
    attempts: [
      { label: 'high-performance · antialias', result: 'null (context creation refused)' },
      { label: 'default · no antialias', result: 'null (context creation refused)' }
    ],
    reason: 'This browser refused every WebGL 2 context request.'
  };
}

export async function bootApp({ hash = '', probe = okProbe, createStage, forceSoftware = false } = {}) {
  const dom = createDom({ hash });
  const record = [];
  const stageFactory = createStage || createStageStub(record);
  const { createApp } = await import('../../src/main.js');
  const app = createApp({
    doc: dom.window.document,
    win: dom.window,
    probe,
    createStage: stageFactory,
    useWorker: false,
    thumbnails: false,
    forceSoftware
  });
  await app.ready;
  await app.settle();
  return { dom, app, record, win: dom.window, doc: dom.window.document };
}

export const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
