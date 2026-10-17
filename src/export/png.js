/**
 * PNG snapshot of a canvas (WebGL viewport or the CPU still canvas).
 */

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas) return reject(new Error('No canvas to snapshot'));
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Snapshot failed'))), 'image/png');
        return;
      } catch (err) {
        /* fall through to dataURL */
      }
    }
    try {
      const url = canvas.toDataURL('image/png');
      const b64 = url.split(',')[1] || '';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: 'image/png' }));
    } catch (err) {
      reject(err);
    }
  });
}
