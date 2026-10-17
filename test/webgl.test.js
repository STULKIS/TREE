import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  createRenderContext,
  describeContext,
  diagnoseWebGL,
  explainReport,
  reportToText,
} from '../src/render/webgl.js';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://studio.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

function fakeGl(overrides = {}) {
  const values = {
    1: 'WebKit WebGL',
    2: 'ANGLE (NVIDIA RTX 3060 Direct3D11)',
    VERSION: 3,
    SHADING_LANGUAGE_VERSION: 4,
    VENDOR: 5,
    RENDERER: 6,
    MAX_TEXTURE_SIZE: 7,
    ...overrides.values,
  };
  return {
    VERSION: 'VERSION',
    SHADING_LANGUAGE_VERSION: 'SHADING_LANGUAGE_VERSION',
    VENDOR: 'VENDOR',
    RENDERER: 'RENDERER',
    MAX_TEXTURE_SIZE: 'MAX_TEXTURE_SIZE',
    getExtension: overrides.getExtension ?? (() => ({ UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 })),
    getParameter: overrides.getParameter ?? ((key) => values[key] ?? null),
    isContextLost: overrides.isContextLost ?? (() => false),
  };
}

function fakeCanvas(handler) {
  const calls = [];
  return {
    calls,
    getContext(api, attributes) {
      calls.push({ api, attributes });
      return handler(api, attributes, calls.length);
    },
  };
}

test('describeContext prefers the unmasked GPU strings', () => {
  const info = describeContext(fakeGl());
  assert.equal(info.vendor, 'WebKit WebGL');
  assert.equal(info.renderer, 'ANGLE (NVIDIA RTX 3060 Direct3D11)');
  assert.equal(info.maxTextureSize, 7);
});

test('describeContext survives a hostile context', () => {
  const hostile = {
    getExtension() {
      throw new Error('blocked');
    },
    getParameter() {
      throw new Error('blocked');
    },
  };
  const info = describeContext(hostile);
  assert.equal(info.vendor, null);
  assert.equal(info.renderer, null);
  assert.equal(describeContext(null), null);
});

test('createRenderContext retries with cheaper attributes', () => {
  const gl = fakeGl();
  const canvas = fakeCanvas((api, attributes, call) => (call >= 3 ? gl : null));
  const result = createRenderContext(canvas);
  assert.equal(result.ok, true);
  assert.equal(result.api, 'webgl2');
  assert.equal(result.context, gl);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.attempts.every((attempt) => attempt.result === 'null'));
  assert.equal(canvas.calls.length, 3);
  assert.equal(canvas.calls[0].attributes.powerPreference, 'high-performance');
});

test('createRenderContext reports every failed attempt without throwing', () => {
  const canvas = fakeCanvas((api, attributes, call) => {
    if (call === 1) throw new Error('driver exploded');
    if (call === 2) return { isContextLost: () => true };
    return null;
  });
  const result = createRenderContext(canvas);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-webgl2');
  assert.equal(result.attempts[0].result, 'throw');
  assert.equal(result.attempts[0].message, 'driver exploded');
  assert.equal(result.attempts[1].result, 'lost');
  assert.equal(createRenderContext(null).reason, 'no-canvas');
});

test('diagnoseWebGL distinguishes WebGL 2, WebGL 1 only, and nothing', () => {
  const original = dom.window.HTMLCanvasElement.prototype.getContext;
  try {
    dom.window.HTMLCanvasElement.prototype.getContext = function getContext(api) {
      return api === 'webgl2' ? fakeGl() : null;
    };
    const full = diagnoseWebGL();
    assert.equal(full.webgl2, true);
    assert.equal(full.webgl1, false);
    assert.match(explainReport(full), /WebGL 2 is available/i);

    dom.window.HTMLCanvasElement.prototype.getContext = function getContext(api) {
      return api === 'webgl' ? fakeGl() : null;
    };
    const legacy = diagnoseWebGL();
    assert.equal(legacy.webgl2, false);
    assert.equal(legacy.webgl1, true);
    assert.match(explainReport(legacy), /only offers WebGL 1/i);

    dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
      return null;
    };
    const none = diagnoseWebGL({ error: new Error('Error creating WebGL context.') });
    assert.equal(none.webgl2, false);
    assert.equal(none.webgl1, false);
    assert.match(explainReport(none), /not exposing WebGL/i);
    assert.match(reportToText(none), /WebGL 2: unavailable/);
    assert.match(reportToText(none), /Renderer error: Error: Error creating WebGL context\./);
  } finally {
    dom.window.HTMLCanvasElement.prototype.getContext = original;
  }
});

test('diagnostics text includes environment details and attempt log', () => {
  const text = reportToText({
    at: '2026-10-17T00:00:00.000Z',
    browser: 'Firefox 131',
    platform: 'Linux x86_64',
    language: 'en-GB',
    embedded: true,
    webgl2: false,
    webgl1: false,
    webgl2Info: null,
    webgl1Info: null,
    devicePixelRatio: 2,
    screen: '1920x1080',
    hardwareConcurrency: 8,
    error: 'Error: boom',
    attempts: [{ api: 'webgl2', result: 'throw', message: 'boom', attributes: { antialias: true } }],
    userAgent: 'Mozilla/5.0 test',
  });
  assert.match(text, /Browser: Firefox 131/);
  assert.match(text, /embedded in an iframe/);
  assert.match(text, /Context attempts:/);
  assert.match(text, /webgl2 throw \(boom\)/);
  assert.match(text, /User agent: Mozilla\/5\.0 test/);
});
