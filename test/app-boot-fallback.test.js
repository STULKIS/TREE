import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Boots the app in a browser without WebGL 2 and checks that:
 *  - it does not die on the blank "WebGL unavailable" screen,
 *  - the software-preview banner appears with diagnostics,
 *  - the studio still generates trees, changes seed and opens export,
 *  - "Try again" restores the 3D stage once a context becomes available.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://studio.test/#oak-4815',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of [
  'window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
  'MouseEvent', 'Blob', 'File', 'FileReader', 'FormData', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'DOMParser',
]) {
  if (window[key] !== undefined) {
    try {
      globalThis[key] = window[key];
    } catch (error) {
      // navigator and friends can be getter-only on newer Node versions
    }
  }
}
globalThis.self = window;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.__webglOk = false;

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  warnings.push(args.join(' '));
};

const { createServer } = await import('vite');

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'stub-webgl-layer',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id.endsWith('/render/stage.js') && importer) return '\0stub-stage';
        if (id.endsWith('/render/webgl.js') && importer) return '\0stub-webgl';
        return null;
      },
      load(id) {
        if (id === '\0stub-stage') {
          return `
            export class Stage {
              constructor(canvas) {
                this.canvas = canvas;
                globalThis.__stage = this;
                globalThis.__stageConstructed = (globalThis.__stageConstructed || 0) + 1;
              }
              setTree(tree) { this.tree = tree; }
              setWind() {}
              setAutoRotate() {}
              setBarkRoughness() {}
              grow() {}
              resetView() {}
              dispose() {}
              screenshot() { return 'data:image/png;base64,'; }
            }
          `;
        }
        if (id === '\0stub-webgl') {
          return `
            export function createRenderContext() {
              if (globalThis.__webglOk === true) {
                return { ok: true, api: 'webgl2', context: {}, attributes: {}, attempts: [], gpu: null };
              }
              return {
                ok: false,
                reason: 'no-webgl2',
                attempts: [
                  { api: 'webgl2', result: 'null', attributes: { antialias: true } },
                  { api: 'webgl2', result: 'throw', message: 'context creation blocked', attributes: { antialias: false } },
                ],
              };
            }
            export function describeContext() { return null; }
            export function diagnoseWebGL({ error = null, attempts = [] } = {}) {
              return {
                at: '2026-10-17T00:00:00.000Z', browser: 'TestBrowser 1', userAgent: 'test-agent',
                platform: 'test', language: 'en', webgl2: false, webgl1: true,
                webgl2Info: null, webgl1Info: null, embedded: true, devicePixelRatio: 1,
                screen: '800x600', hardwareConcurrency: 4,
                error: error ? String(error.message || error) : null, attempts,
              };
            }
            export function explainReport() { return 'This browser only offers WebGL 1, and the 3D renderer needs WebGL 2.'; }
            export function reportToText() { return 'Sapling preview diagnostics — WebGL 2: unavailable'; }
          `;
        }
        return null;
      },
    },
  ],
});

const html = (await import('node:fs')).readFileSync('index.html', 'utf8');
window.document.open();
window.document.write(html.replace('<script type="module" src="/src/main.js"></script>', ''));
window.document.close();

await server.ssrLoadModule('/src/main.js');
await new Promise((resolve) => setTimeout(resolve, 900));

const $ = (id) => window.document.getElementById(id);

test('the studio boots and generates instead of dying on a WebGL error', () => {
  assert.equal(globalThis.__stageConstructed || 0, 0, 'no 3D stage should be built');
  assert.equal($('boot').classList.contains('is-done'), true, 'boot overlay must clear');
  assert.ok($('stat-tris').textContent.length > 0, 'statistics still render');
  assert.equal($('species-name').textContent, 'Oak');
  assert.equal($('seed-input').value, '4815');
});

test('the software preview banner explains the situation', () => {
  assert.equal($('preview-banner').hidden, false);
  assert.equal($('stage').hidden, true);
  assert.equal($('cpu-stage').hidden, false);
  assert.match($('preview-banner').textContent, /Software preview/);
  assert.match($('preview-banner-reason').textContent, /WebGL 1/);
  assert.equal($('btn-wind').disabled, true);
  assert.equal($('btn-rotate').disabled, true);
  assert.equal($('detail-chip').hidden, true);
});

test('the diagnostics dialog reports the probe attempts', () => {
  $('btn-webgl-details').click();
  assert.equal($('webgl-modal').hidden, false);
  const report = $('webgl-report').textContent;
  assert.match(report, /WebGL 2: unavailable/);
  assert.match($('webgl-reason').textContent, /WebGL 1/);
  window.document.querySelector('#webgl-modal [data-close]').click();
  assert.equal($('webgl-modal').hidden, true);
});

test('sculpting and exporting still work without WebGL', async () => {
  const before = $('seed-input').value;
  $('btn-dice').click();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.notEqual($('seed-input').value, before);

  $('btn-export').click();
  assert.equal($('export-modal').hidden, false);
  assert.equal($('download-label').textContent, 'Download .glb');
  window.document.querySelector('#export-modal [data-close]').click();
});

test('retrying builds the 3D stage once a context is available', async () => {
  globalThis.__webglOk = true;
  const retry = window.document.querySelector('#preview-banner [data-webgl-retry]');
  retry.click();
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(globalThis.__stageConstructed, 1, 'a stage should now exist');
  assert.equal($('preview-banner').hidden, true);
  assert.equal($('stage').hidden, false);
  assert.equal($('cpu-stage').hidden, true);
  assert.equal($('btn-wind').disabled, false);
  assert.ok(globalThis.__stage.tree, 'the new stage received the current tree');
});

test('losing the GPU context falls back instead of freezing', async () => {
  const canvas = $('stage');
  canvas.dispatchEvent(new window.Event('webglcontextlost', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal($('preview-banner').hidden, false);
  assert.equal($('stage').hidden, true);
  assert.equal($('cpu-stage').hidden, false);
  assert.equal($('btn-wind').disabled, true);
  assert.ok($('preview-banner-reason').textContent.length > 0);
});

test('a warning with diagnostics was logged for support', () => {
  assert.ok(warnings.some((line) => /software preview mode/.test(line)), warnings.join(' | '));
});

test.after(async () => {
  console.warn = originalWarn;
  await server.close();
});
