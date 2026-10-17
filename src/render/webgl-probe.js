// WebGL 2 probing. Several attribute sets are tried in order; a context that is already lost
// counts as a failure. The winning context is handed to the renderer so probe and renderer
// can never disagree. Every attempt uses a fresh canvas because failed canvases stay poisoned.

export const ATTRIBUTE_SETS = Object.freeze([
  { label: 'high-performance, antialias', attrs: { antialias: true, powerPreference: 'high-performance', alpha: true, depth: true, stencil: false, failIfMajorPerformanceCaveat: false } },
  { label: 'default power, no antialias', attrs: { antialias: false, powerPreference: 'default', alpha: true, depth: true, stencil: false, failIfMajorPerformanceCaveat: false } },
  { label: 'low power, opaque, minimal', attrs: { antialias: false, powerPreference: 'low-power', alpha: false, depth: true, stencil: false, failIfMajorPerformanceCaveat: false } },
]);

const errorText = (err) => String((err && err.message) || err || 'unknown error');

/** Free GPU memory held by a context we created but will not use. */
function loseContext(gl) {
  try {
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext();
  } catch { /* nothing to free */ }
}

/**
 * @param {object} opts
 * @param {() => HTMLCanvasElement} opts.createCanvas
 * @param {typeof ATTRIBUTE_SETS} [opts.attributeSets]
 * @returns {{ok: boolean, canvas: HTMLCanvasElement|null, gl: WebGL2RenderingContext|null, attempts: object[], attrs: object|null}}
 */
export function probeWebGL({ createCanvas, attributeSets = ATTRIBUTE_SETS }) {
  const attempts = [];
  for (const set of attributeSets) {
    let canvas = null;
    let gl = null;
    try {
      canvas = createCanvas();
      gl = canvas.getContext('webgl2', { ...set.attrs });
      if (!gl) throw new Error('getContext("webgl2") returned null');
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) throw new Error('context was lost during creation');
      attempts.push({ label: set.label, ok: true });
      return { ok: true, canvas, gl, attempts, attrs: set.attrs };
    } catch (err) {
      attempts.push({ label: set.label, ok: false, error: errorText(err) });
      loseContext(gl);
    }
  }
  return { ok: false, canvas: null, gl: null, attempts, attrs: null };
}

/** Diagnostics: is WebGL 1 / 2 available at all, and which GPU strings does the browser expose? */
export function describeSupport({ createCanvas, gl = null }) {
  const support = { webgl2: false, webgl1: false, unmaskedVendor: null, unmaskedRenderer: null, errors: [] };
  for (const kind of ['webgl2', 'webgl']) {
    let canvas = null;
    try {
      canvas = createCanvas();
      const ctx = canvas.getContext(kind);
      if (ctx) {
        support[kind === 'webgl2' ? 'webgl2' : 'webgl1'] = true;
        if (!support.unmaskedRenderer) {
          const ext = ctx.getExtension && ctx.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            support.unmaskedVendor = ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL);
            support.unmaskedRenderer = ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          }
        }
      }
    } catch (err) {
      support.errors.push(`${kind}: ${errorText(err)}`);
    }
  }
  if (gl && !support.unmaskedRenderer) {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        support.unmaskedVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        support.unmaskedRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
    } catch { /* masked */ }
  }
  return support;
}
