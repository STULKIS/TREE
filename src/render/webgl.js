/**
 * WebGL capability detection.
 *
 * three.js r186 needs WebGL 2, and context creation can fail for reasons that
 * have nothing to do with the browser being old: hardware acceleration off,
 * a driver reset, too many live contexts after repeated reloads, or a remote
 * desktop session. We therefore try a few attribute combinations and report
 * exactly what happened instead of guessing.
 */

const CONTEXT_ATTRIBUTES = [
  { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' },
  { alpha: true, antialias: true, preserveDrawingBuffer: true },
  { alpha: true, antialias: false, preserveDrawingBuffer: true },
  { alpha: true, antialias: false, preserveDrawingBuffer: false },
  { alpha: false, antialias: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false },
];

function safeGetParameter(gl, key) {
  try {
    const name = gl[key];
    if (name === undefined) return null;
    const value = gl.getParameter(name);
    return typeof value === 'string' ? value : null;
  } catch (error) {
    return null;
  }
}

/** Human-readable GPU details for the context. */
export function describeContext(gl) {
  if (!gl) return null;
  let debug = null;
  try {
    debug = gl.getExtension('WEBGL_debug_renderer_info');
  } catch (error) {
    debug = null;
  }
  let vendor = null;
  let renderer = null;
  try {
    if (debug) {
      vendor = gl.getParameter(debug.UNMASKED_VENDOR_WEBGL);
      renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    }
  } catch (error) {
    vendor = null;
    renderer = null;
  }
  return {
    version: safeGetParameter(gl, 'VERSION'),
    shadingLanguage: safeGetParameter(gl, 'SHADING_LANGUAGE_VERSION'),
    vendor: vendor || safeGetParameter(gl, 'VENDOR'),
    renderer: renderer || safeGetParameter(gl, 'RENDERER'),
    maxTextureSize: (() => {
      try {
        return gl.getParameter(gl.MAX_TEXTURE_SIZE) || null;
      } catch (error) {
        return null;
      }
    })(),
  };
}

/**
 * Creates a WebGL 2 context on the supplied canvas, trying progressively
 * cheaper attribute sets. Never throws.
 */
export function createRenderContext(canvas) {
  const attempts = [];
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { ok: false, reason: 'no-canvas', attempts };
  }

  for (const attributes of CONTEXT_ATTRIBUTES) {
    try {
      const context = canvas.getContext('webgl2', attributes);
      if (context && !(typeof context.isContextLost === 'function' && context.isContextLost())) {
        return {
          ok: true,
          api: 'webgl2',
          context,
          attributes,
          attempts,
          gpu: describeContext(context),
        };
      }
      attempts.push({
        api: 'webgl2',
        attributes,
        result: context ? 'lost' : 'null',
      });
    } catch (error) {
      attempts.push({ api: 'webgl2', attributes, result: 'throw', message: error.message });
    }
  }

  return { ok: false, reason: 'no-webgl2', attempts };
}

function probeOnDetachedCanvas(api) {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext(api);
    if (!context) return null;
    return describeContext(context);
  } catch (error) {
    return null;
  }
}

function browserName() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const brands = navigator?.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length) {
    return brands
      .filter((entry) => entry.brand && !/Not.?A.?Brand/i.test(entry.brand))
      .map((entry) => `${entry.brand} ${entry.version}`)
      .join(', ');
  }
  const edge = ua.match(/Edg\/([\d.]+)/);
  if (edge) return `Edge ${edge[1]}`;
  const firefox = ua.match(/Firefox\/([\d.]+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const safari = ua.match(/Version\/([\d.]+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return ua || 'unknown browser';
}

/**
 * Full report used by the fallback UI. `error` is the exception thrown by the
 * renderer, if any, so it can be surfaced verbatim.
 */
export function diagnoseWebGL({ error = null, attempts = [] } = {}) {
  const webgl2 = probeOnDetachedCanvas('webgl2');
  const webgl1 = webgl2 ? null : probeOnDetachedCanvas('webgl');
  const embedded = (() => {
    try {
      return window.self !== window.top;
    } catch (exception) {
      return true;
    }
  })();

  return {
    at: new Date().toISOString(),
    browser: browserName(),
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'unknown',
    language: typeof navigator === 'undefined' ? 'unknown' : navigator.language || 'unknown',
    webgl2: Boolean(webgl2),
    webgl1: Boolean(webgl1),
    webgl2Info: webgl2,
    webgl1Info: webgl1,
    embedded,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    screen: typeof window === 'undefined' ? null : `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    hardwareConcurrency: typeof navigator === 'undefined' ? null : navigator.hardwareConcurrency || null,
    error: error ? `${error.name || 'Error'}: ${error.message || String(error)}` : null,
    attempts,
  };
}

/** One-line explanation aimed at the person looking at the screen. */
export function explainReport(report) {
  if (!report) return 'The 3D renderer could not start.';
  if (!report.webgl2 && report.webgl1) {
    return 'This browser only offers WebGL 1, and the 3D renderer needs WebGL 2.';
  }
  if (!report.webgl2 && !report.webgl1) {
    return 'This browser is not exposing WebGL at all — hardware acceleration is probably switched off.';
  }
  if (report.error) {
    return `WebGL 2 is available, but the renderer could not start (${report.error}).`;
  }
  return 'WebGL 2 is available, but the 3D renderer failed to initialise.';
}

/** Plain text blob for the "copy diagnostics" button. */
export function reportToText(report) {
  if (!report) return 'Sapling — no diagnostics available';
  const lines = [
    'Sapling preview diagnostics',
    `When: ${report.at}`,
    `Browser: ${report.browser}`,
    `Platform: ${report.platform} · ${report.language}`,
    `Frame: ${report.embedded ? 'embedded in an iframe' : 'top-level page'}`,
    `WebGL 2: ${report.webgl2 ? 'available' : 'unavailable'}`,
    `WebGL 1: ${report.webgl1 ? 'available' : 'unavailable'}`,
    `Screen: ${report.screen} @ ${report.devicePixelRatio}x · ${report.hardwareConcurrency ?? '?'} cores`,
  ];
  if (report.webgl2Info) {
    lines.push(
      `GPU: ${report.webgl2Info.vendor || '?'} — ${report.webgl2Info.renderer || '?'}`,
      `GL version: ${report.webgl2Info.version || '?'}`,
    );
  }
  if (report.webgl1Info) {
    lines.push(`GPU (WebGL 1): ${report.webgl1Info.vendor || '?'} — ${report.webgl1Info.renderer || '?'}`);
  }
  if (report.error) lines.push(`Renderer error: ${report.error}`);
  if (report.attempts?.length) {
    lines.push('Context attempts:');
    for (const attempt of report.attempts) {
      lines.push(
        `  ${attempt.api} ${attempt.result}` +
          `${attempt.message ? ` (${attempt.message})` : ''} ` +
          `${attempt.attributes ? JSON.stringify(attempt.attributes) : ''}`,
      );
    }
  }
  lines.push(`User agent: ${report.userAgent}`);
  return lines.join('\n');
}
