// Filenames and download helpers shared by every exporter.

export function fileStem(design, kind) {
  const species = design.species;
  return `sapling-${species}-${design.seed}${kind ? `-${kind}` : ''}`;
}

export function triggerDownload(doc, win, blob, filename) {
  const url = win.URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  doc.body.append(a);
  a.click();
  a.remove();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 4000);
}

/** Decode a data: URL produced by canvas.toDataURL into bytes. */
export function dataURLToBlob(dataURL, type = 'image/png') {
  const comma = dataURL.indexOf(',');
  const bin = atob(dataURL.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
