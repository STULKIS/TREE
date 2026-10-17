/**
 * WebGL 2 probe. Tries several attribute sets, each on a fresh canvas (a
 * canvas whose context creation failed stays poisoned), catches throws and
 * treats lost contexts as failures. The winning canvas + context are handed
 * to the renderer so the probe and renderer cannot disagree.
 */

export const CONTEXT_ATTEMPTS = [
  {
    label: 'high-performance · antialias',
    attrs: { powerPreference: 'high-performance', antialias: true, alpha: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false }
  },
  {
    label: 'default · antialias',
    attrs: { antialias: true, alpha: false, depth: true, stencil: false }
  },
  {
    label: 'default · no antialias',
    attrs: { antialias: false, alpha: false, depth: true, stencil: false }
  },
  {
    label: 'low-power · no antialias · minimal',
    attrs: { powerPreference: 'low-power', antialias: false, alpha: false, depth: true, stencil: false, failIfMajorPerformanceCaveat: false }
  }
];

/**
 * @param {() => HTMLCanvasElement} createCanvas factory returning a fresh canvas
 * @param {object} [options]
 * @param {boolean} [options.force] when true, force a failure (for the `?nogl` debug flag)
 * @param {Array} [options.attempts] override attribute sets
 */
export function probeWebGL2(createCanvas, options = {}) {
  const attempts = [];
  const list = options.attempts || CONTEXT_ATTEMPTS;
  if (options.force) {
    return { ok: false, reason: 'WebGL disabled by the ?nogl flag.', attempts: [{ label: 'forced', result: 'skipped (forced software mode)' }] };
  }
  for (const attempt of list) {
    let canvas = null;
    try {
      canvas = createCanvas();
      if (!canvas || typeof canvas.getContext !== 'function') {
        attempts.push({ label: attempt.label, result: 'no canvas element' });
        continue;
      }
      const gl = canvas.getContext('webgl2', attempt.attrs);
      if (!gl) {
        attempts.push({ label: attempt.label, result: 'null (context creation refused)' });
        continue;
      }
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
        attempts.push({ label: attempt.label, result: 'context created but already lost' });
        continue;
      }
      if (typeof gl.getParameter !== 'function') {
        attempts.push({ label: attempt.label, result: 'object returned is not a WebGL2 context' });
        continue;
      }
      const actual = typeof gl.getContextAttributes === 'function' ? gl.getContextAttributes() : null;
      attempts.push({ label: attempt.label, result: 'ok', attrs: actual });
      return { ok: true, canvas, context: gl, attrs: attempt.attrs, actualAttrs: actual, attempts, reason: '' };
    } catch (err) {
      attempts.push({ label: attempt.label, result: `threw: ${(err && err.message) || err}` });
    }
  }
  return {
    ok: false,
    canvas: null,
    context: null,
    attempts,
    reason: summarizeFailure(attempts)
  };
}

export function summarizeFailure(attempts) {
  const threw = attempts.find((a) => a.result.startsWith('threw'));
  if (threw) return `The browser threw while creating a WebGL 2 context (${threw.result.replace('threw: ', '')}).`;
  if (attempts.some((a) => a.result.includes('lost'))) return 'WebGL 2 contexts are being created already lost — the GPU process may be unavailable.';
  if (attempts.length && attempts.every((a) => a.result.startsWith('null'))) {
    return 'This browser refused every WebGL 2 context request. Hardware acceleration may be disabled, or the GPU is blocklisted.';
  }
  return 'WebGL 2 is not available in this browser.';
}

/** Quick capability check on a scratch canvas (never reused by the renderer). */
export function quickCheck(createCanvas, kind) {
  try {
    const c = createCanvas();
    const gl = c && c.getContext(kind, { failIfMajorPerformanceCaveat: false });
    if (!gl) return { available: false };
    const info = { available: true };
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        info.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
      info.version = gl.getParameter(gl.VERSION);
    } catch {
      /* ignore */
    }
    const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose && typeof lose.loseContext === 'function') {
      try {
        lose.loseContext();
      } catch {
        /* ignore */
      }
    }
    return info;
  } catch (err) {
    return { available: false, error: String((err && err.message) || err) };
  }
}
