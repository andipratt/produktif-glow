// Grid kecerahan foto (untuk memilih warna teks label). Gagal decode -> null (label pakai warna default).
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export function gridLum(buf, mime = '', cols = 18, rows = 22) {
  try {
    let w, h, data;
    if (/png/i.test(mime) || (buf[0] === 0x89 && buf[1] === 0x50)) { const p = PNG.sync.read(buf); w = p.width; h = p.height; data = p.data; }
    else if (/jpe?g/i.test(mime) || (buf[0] === 0xff && buf[1] === 0xd8)) { const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 }); w = j.width; h = j.height; data = j.data; }
    else return null;
    const v = new Array(cols * rows).fill(0), n = new Array(cols * rows).fill(0), q = new Array(cols * rows).fill(0);
    const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const c = Math.min(cols - 1, Math.floor(x / w * cols)) + Math.min(rows - 1, Math.floor(y / h * rows)) * cols;
      v[c] += l; q[c] += l * l; n[c] += 1;
    }
    return { cols, rows, v: v.map((s, i) => Math.round(n[i] ? s / n[i] : 200)),
      sd: v.map((s, i) => (n[i] ? Math.round(Math.sqrt(Math.max(0, q[i] / n[i] - (s / n[i]) ** 2))) : 0)) };
  } catch { return null; }
}

export function lumDariDataUri(uri) {
  const m = String(uri).match(/^data:([^;]+);base64,(.*)$/);
  return m ? gridLum(Buffer.from(m[2], 'base64'), m[1]) : null;
}
