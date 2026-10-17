/** Browser download helpers (no-ops in non-DOM environments). */

export function exportFilename(species, seed, ext) {
  const safeSeed = String(seed).replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || '0';
  return `sapling-${species}-${safeSeed}.${ext}`;
}

export function downloadBlob(blob, filename, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
  return true;
}

export function downloadText(text, filename, mime = 'text/plain') {
  return downloadBlob(new Blob([text], { type: mime }), filename);
}

export function downloadBuffer(buffer, filename, mime = 'application/octet-stream') {
  return downloadBlob(new Blob([buffer], { type: mime }), filename);
}
