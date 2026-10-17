/**
 * Diagnostics for the software-mode "Details" dialog.
 */
import { quickCheck } from './probe.js';

export function collectDiagnostics({ probe, win = typeof window !== 'undefined' ? window : null, createCanvas } = {}) {
  const nav = win && win.navigator ? win.navigator : {};
  const scr = win && win.screen ? win.screen : {};
  let inIframe = false;
  try {
    inIframe = Boolean(win && win.top !== win.self);
  } catch {
    inIframe = true;
  }
  const gl2 = createCanvas ? quickCheck(createCanvas, 'webgl2') : { available: false };
  const gl1 = createCanvas ? quickCheck(createCanvas, 'webgl') : { available: false };
  const uaData = nav.userAgentData;
  return {
    browser: nav.userAgent || 'unknown',
    brands: uaData && Array.isArray(uaData.brands) ? uaData.brands.map((b) => `${b.brand} ${b.version}`).join(', ') : '',
    platform: (uaData && uaData.platform) || nav.platform || 'unknown',
    language: nav.language || '',
    inIframe,
    devicePixelRatio: win && win.devicePixelRatio ? win.devicePixelRatio : 1,
    screen: scr.width ? `${scr.width}×${scr.height} @ ${scr.colorDepth || '?'}bit` : 'unknown',
    viewport: win ? `${win.innerWidth}×${win.innerHeight}` : 'unknown',
    cores: nav.hardwareConcurrency || 'unknown',
    memory: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'unknown',
    reducedMotion: Boolean(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches),
    webgl2: gl2,
    webgl1: gl1,
    gpuVendor: gl2.vendor || gl1.vendor || 'unavailable (masked or no context)',
    gpuRenderer: gl2.renderer || gl1.renderer || 'unavailable (masked or no context)',
    attempts: probe && probe.attempts ? probe.attempts : [],
    reason: probe && probe.reason ? probe.reason : '',
    workers: typeof Worker !== 'undefined',
    time: new Date().toISOString()
  };
}

export function formatDiagnostics(d) {
  const lines = [
    'Sapling diagnostics',
    `Time: ${d.time}`,
    `Reason: ${d.reason || 'n/a'}`,
    `Browser: ${d.browser}`,
    d.brands ? `Brands: ${d.brands}` : null,
    `Platform: ${d.platform}`,
    `Language: ${d.language}`,
    `In iframe: ${d.inIframe ? 'yes' : 'no'}`,
    `Device pixel ratio: ${d.devicePixelRatio}`,
    `Screen: ${d.screen}`,
    `Viewport: ${d.viewport}`,
    `Logical cores: ${d.cores}`,
    `Device memory: ${d.memory}`,
    `Reduced motion: ${d.reducedMotion ? 'yes' : 'no'}`,
    `Web Workers: ${d.workers ? 'yes' : 'no'}`,
    `WebGL 2: ${d.webgl2.available ? 'available' : 'unavailable'}${d.webgl2.version ? ` (${d.webgl2.version})` : ''}${d.webgl2.error ? ` — ${d.webgl2.error}` : ''}`,
    `WebGL 1: ${d.webgl1.available ? 'available' : 'unavailable'}${d.webgl1.version ? ` (${d.webgl1.version})` : ''}${d.webgl1.error ? ` — ${d.webgl1.error}` : ''}`,
    `GPU vendor: ${d.gpuVendor}`,
    `GPU renderer: ${d.gpuRenderer}`,
    'Context attempts:'
  ].filter(Boolean);
  if (!d.attempts.length) lines.push('  (none recorded)');
  for (const a of d.attempts) lines.push(`  • ${a.label}: ${a.result}`);
  return lines.join('\n');
}
