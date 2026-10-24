// Tata letak produk DITENTUKAN SEBELUM foto dibuat, jadi posisi pin sudah pasti sejak awal.
// Koordinat box_2d = [ymin, xmin, ymax, xmax] skala 0-1000 (sama dengan format deteksi).
const W = 1080, H = 1350;
const SKALA = { besar: 1, sedang: 0.72, kecil: 0.5 };

export function ukuranProduk(p) {
  const u = String(p.ukuran || '').toLowerCase();
  if (SKALA[u]) return u;
  const t = `${p.jenis || ''} ${p.nama || ''}`.toLowerCase();
  if (/rak|organizer|lampu|stand|monitor|cermin|keranjang|box|laci|kursi/.test(t)) return 'besar';
  if (/spatula|lip|sachet|serum|kapas|tisu|sheet|jepit|ikat|pouch|spons|sponge/.test(t)) return 'kecil';
  return 'sedang';
}

// Satu baris (<=4 produk) atau dua baris (5-8): barang besar di belakang, kecil di depan.
// Area produk dijaga di tengah (x 90-990, y 360-1000) supaya pinggir foto lega untuk label.
export function rencanaTata(produk) {
  const list = produk.map((p) => ({ pin: Number(p.pin), ukuran: ukuranProduk(p) }))
    .sort((a, b) => SKALA[b.ukuran] - SKALA[a.ukuran] || a.pin - b.pin);
  const n = list.length;
  const baris = n <= 4 ? [list] : [list.slice(0, Math.ceil(n / 2)), list.slice(Math.ceil(n / 2))];
  const area = baris.length === 1 ? [{ top: 440, bottom: 960 }] : [{ top: 330, bottom: 640 }, { top: 690, bottom: 1010 }];
  const X0 = 90, X1 = 990, GAP = 34;
  const out = [];
  baris.forEach((row, bi) => {
    // urutkan lagi per pin supaya nomor kiri-ke-kanan rapi
    row.sort((a, b) => a.pin - b.pin);
    const { top, bottom } = area[bi];
    const tinggiPenuh = bottom - top;
    const lebarSlot = (X1 - X0 - GAP * (row.length - 1)) / row.length;
    // baris depan digeser setengah slot supaya tidak menutupi barang di belakang persis
    const geser = bi === 1 && baris[0].length === row.length ? Math.min(lebarSlot * 0.25, 60) : 0;
    row.forEach((p, i) => {
      const s = SKALA[p.ukuran];
      const w = Math.min(lebarSlot, tinggiPenuh * 0.95) * (0.55 + 0.45 * s);
      const h = tinggiPenuh * s;
      const cx = X0 + lebarSlot * i + GAP * i + lebarSlot / 2 + geser;
      const x0 = Math.max(X0 - 40, cx - w / 2), x1 = Math.min(X1 + 40, cx + w / 2);
      const y1 = bottom, y0 = bottom - h;
      out.push({ pin: p.pin, ukuran: p.ukuran, box_2d: [y0 / H * 1000, x0 / W * 1000, y1 / H * 1000, x1 / W * 1000].map((v) => Math.round(v)) });
    });
  });
  return out.sort((a, b) => a.pin - b.pin);
}

const iou = (a, b) => {
  const [ay0, ax0, ay1, ax1] = a, [by0, bx0, by1, bx1] = b;
  const iw = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)), ih = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  const u = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - iw * ih;
  return u > 0 ? (iw * ih) / u : 0;
};

// Gabung rencana + hasil deteksi: deteksi dipakai kalau masih di sekitar slot rencananya, selain itu pakai slot rencana.
// Hasil: setiap produk PASTI punya pin.
export function gabungKotak(rencana, deteksi) {
  const det = new Map((deteksi || []).filter((d) => Array.isArray(d.box_2d) && d.box_2d.length === 4).map((d) => [Number(d.pin), d.box_2d.map(Number)]));
  let dipakai = 0;
  const boxes = rencana.map((r) => {
    const d = det.get(r.pin);
    if (d) {
      const [y0, x0, y1, x1] = r.box_2d; const cy = (d[0] + d[2]) / 2, cx = (d[1] + d[3]) / 2;
      const mx = (x1 - x0) * 0.6, my = (y1 - y0) * 0.6;
      const dekat = cx > x0 - mx && cx < x1 + mx && cy > y0 - my && cy < y1 + my;
      if (iou(r.box_2d, d) > 0.12 || dekat) { dipakai += 1; return { pin: r.pin, box_2d: d, sumber: 'deteksi' }; }
    }
    return { pin: r.pin, box_2d: r.box_2d, sumber: 'rencana' };
  });
  return { boxes, dipakai };
}
