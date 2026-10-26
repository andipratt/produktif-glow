// Deteksi satu produk di foto (kotak + titik pin). Dipakai bot (draft) dan video (sudut Reels).
import { chatOR } from './ai.js';
import { bodyDeteksiSatu, bacaJsonModel } from './agen.js';

export async function deteksiSatu(p, dataUri) {
  const coba = async (prod) => {
    try {
      const j = bacaJsonModel(await chatOR(bodyDeteksiSatu(prod, dataUri)));
      const b = Array.isArray(j.box_2d) ? j.box_2d.map(Number) : null;
      if (j.found === false || !b || b.length !== 4 || b[2] <= b[0] || b[3] <= b[1]) return null;
      // titik pin dari model; dipakai hanya kalau benar-benar di dalam kotaknya sendiri
      const t = Array.isArray(j.point) && j.point.length === 2 ? j.point.map(Number) : null;
      const ok = t && t[0] >= b[0] && t[0] <= b[2] && t[1] >= b[1] && t[1] <= b[3];
      return { box: b, titik: ok ? t : null };
    } catch { return null; }
  };
  // percobaan kedua tanpa foto listing (kadang foto promo justru membingungkan)
  return (await coba(p)) || (p.img ? await coba({ ...p, img: '' }) : null);
}
