import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Boots the real app against a stubbed WebGL stage, so the wiring between the
 * DOM, the panel, the generator and the export dialog is exercised end to end.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://studio.test/#willow-2468',
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
      // some globals (navigator) are getter-only in newer Node versions
    }
  }
}
globalThis.self = window;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
// no Worker in this environment: the app must fall back to main-thread growth

const { createServer } = await import('vite');

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'stub-stage',
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
                this.calls = [];
                globalThis.__stage = this;
              }
              setTree(tree, options) { this.tree = tree; this.options = options; this.calls.push('setTree'); }
              setWind(value) { this.wind = value; }
              setAutoRotate(value) { this.autoRotate = value; }
              setBarkRoughness(value) { this.roughness = value; }
              grow() {}
              frameTree() {}
              resetView() {}
              dispose() {}
              screenshot() { return 'data:image/png;base64,'; }
              render() {}
            }
          `;
        }
        if (id === '\0stub-webgl') {
          return `
            export function createRenderContext() {
              if (globalThis.__webglOk === false) {
                return { ok: false, reason: 'no-webgl2', attempts: [{ api: 'webgl2', result: 'null', attributes: {} }] };
              }
              return { ok: true, api: 'webgl2', context: {}, attributes: {}, attempts: [], gpu: null };
            }
            export function describeContext() { return null; }
            export function diagnoseWebGL({ error = null, attempts = [] } = {}) {
              return {
                at: '2026-10-17T00:00:00.000Z', browser: 'TestBrowser 1', userAgent: 'test',
                platform: 'test', language: 'en', webgl2: false, webgl1: false,
                webgl2Info: null, webgl1Info: null, embedded: true, devicePixelRatio: 1,
                screen: '800x600', hardwareConcurrency: 4,
                error: error ? String(error.message || error) : null, attempts,
              };
            }
            export function explainReport() { return 'WebGL 2 is unavailable in this test browser.'; }
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
// the fallback path grows synchronously; give timers a moment to flush
await new Promise((resolve) => setTimeout(resolve, 900));

const $ = (id) => window.document.getElementById(id);

test('the app boots from a share link, grows a tree and fills the interface', () => {
  assert.ok(globalThis.__stage?.tree, 'stage received a tree');
  assert.ok(globalThis.__stage.tree.stats.triangles > 1000);
  assert.equal($('species-name').textContent, 'Willow');
  assert.equal($('species-latin').textContent, 'Salix babylonica');
  assert.match($('stat-tris').textContent, /k|,/);
  assert.equal(window.document.querySelectorAll('.species').length, 6);
  assert.ok(window.document.querySelectorAll('.group').length >= 5);
  assert.equal($('seed-input').value, '2468');
  assert.equal(window.location.hash, '#willow-2468');
});

test('the field guide switches species and keeps the seed', async () => {
  const pine = window.document.querySelector('[data-species="pine"]');
  pine.click();
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal($('species-name').textContent, 'Pine');
  assert.equal($('species-latin').textContent, 'Pinus sylvestris');
  assert.equal($('seed-input').value, '2468');
  assert.equal(window.location.hash, '#pine-2468');
  assert.equal(window.document.querySelector('.species.is-active').dataset.species, 'pine');
});

test('seed dice changes the tree and the share hash', async () => {
  const before = $('stat-tris').textContent;
  $('btn-dice').click();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.notEqual($('seed-input').value, '2468');
  assert.match(window.location.hash, /^#pine-\d+$/);
  assert.ok($('stat-tris').textContent.length > 0);
  assert.equal(before.length > 0, true);
});

test('export dialog opens, switches format and updates its copy', () => {
  $('btn-export').click();
  assert.equal($('export-modal').hidden, false);
  const obj = window.document.querySelector('[data-format="obj"]');
  obj.click();
  assert.equal($('download-label').textContent, 'Download .zip (OBJ + MTL)');
  assert.match($('export-copy').textContent, /Wavefront/);
  window.document.querySelector('#export-modal [data-close]').click();
  assert.equal($('export-modal').hidden, true);
});

test('the panel sliders write through to a regenerated tree', async () => {
  const height = $('panel-body').querySelector('input[type="range"]');
  height.value = '14';
  height.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.match($('stat-height').textContent, /^1[0-9]\./);
  assert.equal(window.document.querySelectorAll('.group-title')[0].textContent, 'Trunk');
});

test('loading a design JSON restores a tree', async () => {
  const design = {
    species: 'willow',
    seed: 2222,
    params: {
      species: 'willow',
      seed: 2222,
      trunk: { height: 6, radius: 0.5, flare: 0.9, lean: 6, wobble: 0.6, segments: 24, sides: 9 },
      branches: { levels: 10, start: 0.3, end: 0.92, angle: 60, angleVar: 12, upBias: -0.2, droop: 0.7, reach: 0.7, split: 2, depth: 4, taper: 0.62, gnarl: 0.5, segments: 9, sides: 6 },
      leaves: { style: 'slender', density: 1.1, size: 0.2, sizeVar: 0.3, colorA: '#6f8749', colorB: '#b3c37a', colorTip: '#dfe0a8', wind: 1.4 },
      bark: { colorA: '#493d2e', colorB: '#82705a', roughness: 0.96, lumpiness: 0.18 },
    },
  };
  const file = new window.File([JSON.stringify(design)], 'willow.json', { type: 'application/json' });
  const input = $('load-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal($('species-name').textContent, 'Willow');
  assert.equal($('seed-input').value, '2222');
});

test('the booted interface has no structural accessibility violations', async () => {
  const { default: axe } = await import('axe-core');
  window.eval(axe.source);
  const result = await window.axe.run(window.document, {
    resultTypes: ['violations'],
    rules: {
      // jsdom has no layout or paint, so contrast cannot be evaluated here
      'color-contrast': { enabled: false },
      'region': { enabled: false },
    },
  });
  const summary = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  assert.deepEqual(summary, []);
});

test.after(async () => {
  await server.close();
});
