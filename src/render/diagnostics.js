// Plain-text diagnostics for the "Details" dialog. Pure: all browser state is passed in.

export function collectDiagnostics({ win, nav, screen, probe = null, support = null, reason = '' }) {
  const lines = [];
  const add = (k, v) => lines.push(`${k}: ${v}`);
  add('Sapling diagnostics', new Date(0).toISOString().slice(0, 0) || 'generated on demand');
  add('Reason', reason || 'none');
  add('Browser', nav?.userAgent ?? 'unknown');
  add('Platform', nav?.platform ?? 'unknown');
  add('Language', nav?.language ?? 'unknown');
  add('Cores', nav?.hardwareConcurrency ?? 'unknown');
  add('Memory (GB, approx)', nav?.deviceMemory ?? 'unknown');
  add('Embedded in iframe', win && win.top !== win.self ? 'yes' : 'no');
  add('Device pixel ratio', win?.devicePixelRatio ?? 1);
  add('Viewport', `${win?.innerWidth ?? '?'}×${win?.innerHeight ?? '?'}`);
  add('Screen', `${screen?.width ?? '?'}×${screen?.height ?? '?'}`);
  add('WebGL 2 available', support ? (support.webgl2 ? 'yes' : 'no') : 'not checked');
  add('WebGL 1 available', support ? (support.webgl1 ? 'yes' : 'no') : 'not checked');
  add('GPU vendor (unmasked)', support?.unmaskedVendor ?? 'unavailable');
  add('GPU renderer (unmasked)', support?.unmaskedRenderer ?? 'unavailable');
  lines.push('Context attempts:');
  const attempts = probe?.attempts ?? [];
  if (attempts.length === 0) lines.push('  (none recorded)');
  for (const a of attempts) {
    lines.push(`  - ${a.label}: ${a.ok ? 'ok' : `failed (${a.error})`}`);
  }
  if (support?.errors?.length) {
    lines.push('Support probe errors:');
    for (const e of support.errors) lines.push(`  - ${e}`);
  }
  return lines.join('\n');
}
