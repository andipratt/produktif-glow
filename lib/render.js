// Renderer slide carousel Produktif Glow (1080x1350, rasio 4:5).
// Slide: "hook" (judul pembuka), "peta" (pin bernomor + label produk), "struk" (daftar + total + CTA + disclaimer).
import { ImageResponse } from '@vercel/og';
import { fraunces600, fraunces400, dmsans500, dmsans700 } from './fonts.js';

const W = 1080, H = 1350;
const C = { ink: '#2A201B', cream: '#F7F1E8', paper: '#FBF7F1', muted: '#6B5A4E', glow: '#E3A06F', line: '#D9C9B4' };

const buf = (b64) => { const b = Buffer.from(b64, 'base64'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const FONTS = [
  { name: 'Fraunces', data: buf(fraunces600), weight: 600, style: 'normal' },
  { name: 'Fraunces', data: buf(fraunces400), weight: 400, style: 'normal' },
  { name: 'DM Sans', data: buf(dmsans500), weight: 500, style: 'normal' },
  { name: 'DM Sans', data: buf(dmsans700), weight: 700, style: 'normal' },
];

// elemen ala React tanpa JSX
const h = (type, style = {}, children = null, extra = {}) => ({ type, props: { style: { display: 'flex', ...style }, children, ...extra } });
const svg = (w, hgt, children, style = {}) => ({ type: 'svg', props: { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, style, children } });
const el = (type, props) => ({ type, props });

export const rupiah = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '' : 'Rp' + Number(n).toLocaleString('id-ID').replace(/,/g, '.');
const pad = (n) => String(n).padStart(2, '0');

function bg(src) {
  return el('img', { src, width: W, height: H, style: { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' } });
}

function logoMark(size, deskColor) {
  return svg(120, 120, [
    el('path', { d: 'M40 72 A20 20 0 0 1 80 72 Z', fill: C.glow }),
    el('line', { x1: 60, y1: 44, x2: 60, y2: 35, stroke: C.glow, strokeWidth: 6, strokeLinecap: 'round' }),
    el('line', { x1: 40, y1: 52, x2: 34, y2: 46, stroke: C.glow, strokeWidth: 6, strokeLinecap: 'round' }),
    el('line', { x1: 80, y1: 52, x2: 86, y2: 46, stroke: C.glow, strokeWidth: 6, strokeLinecap: 'round' }),
    el('line', { x1: 24, y1: 74, x2: 96, y2: 74, stroke: deskColor, strokeWidth: 7, strokeLinecap: 'round' }),
    el('line', { x1: 34, y1: 74, x2: 34, y2: 92, stroke: deskColor, strokeWidth: 7, strokeLinecap: 'round' }),
    el('line', { x1: 86, y1: 74, x2: 86, y2: 92, stroke: deskColor, strokeWidth: 7, strokeLinecap: 'round' }),
  ], { width: size, height: size });
}

// Watermark kecil di pojok kanan bawah, sengaja tidak mencolok
function watermark() {
  return h('div', { position: 'absolute', right: 30, bottom: 26, alignItems: 'center', gap: 6, opacity: 0.62,
    backgroundColor: 'rgba(42,32,27,0.35)', borderRadius: 999, padding: '4px 12px 4px 4px' }, [
    logoMark(30, C.cream),
    h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 18, color: C.cream, letterSpacing: 0.3 }, 'produktif.glow'),
  ]);
}

function slideHook(d) {
  const kicker = d.kicker || 'produktif glow';
  return h('div', { width: W, height: H, position: 'relative', backgroundColor: C.ink }, [
    bg(d.img),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H,
      backgroundImage: 'linear-gradient(180deg, rgba(20,14,10,0) 35%, rgba(20,14,10,0.35) 58%, rgba(20,14,10,0.82) 100%)' }),
    h('div', { position: 'absolute', left: 72, right: 72, bottom: 120, flexDirection: 'column', gap: 22 }, [
      h('div', { alignItems: 'center', gap: 12 }, [
        h('div', { width: 36, height: 3, backgroundColor: C.glow, borderRadius: 2 }),
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 24, letterSpacing: 4, color: C.glow, textTransform: 'uppercase' }, kicker),
      ]),
      h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: d.judul && d.judul.length > 40 ? 84 : 100, lineHeight: 1.02, color: C.cream, letterSpacing: -1.5 }, d.judul || ''),
      d.sub ? h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 32, lineHeight: 1.35, color: 'rgba(247,241,232,0.88)', maxWidth: 860 }, d.sub) : null,
      h('div', { alignItems: 'center', gap: 10, marginTop: 8 }, [
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 24, color: C.ink, backgroundColor: C.cream, borderRadius: 999, padding: '10px 22px' }, d.swipe || 'Geser buat lihat barangnya  →'),
      ]),
    ].filter(Boolean)),
    watermark(),
  ]);
}

// Titik pin: di dalam kotak produknya sendiri, tapi menghindari produk lain yang menumpuk di atasnya
// (misal mouse di atas desk mat) dan menjauhi pin lain, supaya pin tidak tumpang tindih.
function anchorPins(items, toPx) {
  const done = [];
  const boxes = items.map((it) => ({ it, p: toPx(it.box) }));
  const area = (p) => (p.x1 - p.x0) * (p.y1 - p.y0);
  const inside = (x, y, p, m = 0) => x > p.x0 - m && x < p.x1 + m && y > p.y0 - m && y < p.y1 + m;
  // produk kecil dulu: titik tengahnya paling jelas
  const order = [...boxes].sort((a, b) => area(a.p) - area(b.p));
  for (const b of order) {
    const p = b.p, others = boxes.filter((o) => o !== b && area(o.p) < area(p));
    let best = null;
    for (let gy = 0.2; gy <= 0.801; gy += 0.1) for (let gx = 0.15; gx <= 0.851; gx += 0.07) {
      const x = p.x0 + (p.x1 - p.x0) * gx, y = p.y0 + (p.y1 - p.y0) * gy;
      let s = Math.hypot(gx - 0.5, gy - 0.5) * 100;
      others.forEach((o) => { if (inside(x, y, o.p, 40)) s += 5000; });
      done.forEach((q) => { const dd = Math.hypot(q.cx - x, q.cy - y); if (dd < 120) s += (120 - dd) * 60; });
      if (x < 40 || x > W - 40 || y < 40 || y > H - 40) s += 3000;
      if (!best || s < best.s) best = { s, x, y };
    }
    done.push({ ...b.it, p, cx: best.x, cy: best.y });
  }
  return done;
}

// Ukuran label teks (tanpa kartu): perkiraan lebar dari jumlah huruf
// ===== Label gaya "callout": nama + harga di ruang kosong DI LUAR kotak produk, panah pendek melengkung =====
const FN = 30, FP = 27, LH = 74, PANAH_MAKS = 230;
function ukuranLabel(p) {
  const nama = `${pad(p.pin)}  ${String(p.nama || '')}`;
  const wNama = nama.length * FN * 0.52;
  const wHarga = (rupiah(p.harga) || 'cek harga di link bio').length * FP * 0.55;
  return { CW: Math.min(470, Math.max(wNama, wHarga) + 16), CH: LH };
}

// Kecerahan rata-rata area foto (grid dari server) -> teks putih bayangan gelap, atau teks gelap bayangan terang
function warnaLabel(lum, r) {
  const terang = { teks: '#1E1712', halo: 'rgba(255,252,247,0.95)', angka: '#B0632D' };
  const gelap = { teks: '#FFFFFF', halo: 'rgba(0,0,0,0.8)', angka: '#F4B27C' };
  if (!lum || !lum.v) return terang;
  const cw = W / lum.cols, ch = H / lum.rows;
  let sum = 0, n = 0;
  for (let y = Math.max(0, Math.floor(r.y0 / ch)); y <= Math.min(lum.rows - 1, Math.floor(r.y1 / ch)); y++)
    for (let x = Math.max(0, Math.floor(r.x0 / cw)); x <= Math.min(lum.cols - 1, Math.floor(r.x1 / cw)); x++) { sum += lum.v[y * lum.cols + x]; n++; }
  return (n ? sum / n : 200) > 140 ? terang : gelap;
}

// Seberapa "ramai" area foto; label lebih enak dibaca di area polos
function keramaian(lum, r) {
  if (!lum || !lum.sd) return 10;
  const cw = W / lum.cols, ch = H / lum.rows; let sum = 0, n = 0;
  for (let y = Math.max(0, Math.floor(r.y0 / ch)); y <= Math.min(lum.rows - 1, Math.floor(r.y1 / ch)); y++)
    for (let x = Math.max(0, Math.floor(r.x0 / cw)); x <= Math.min(lum.cols - 1, Math.floor(r.x1 / cw)); x++) { sum += lum.sd[y * lum.cols + x]; n++; }
  return n ? sum / n : 10;
}

const toPx = (b) => { const [y0, x0, y1, x1] = b.map(Number); return { x0: x0 / 1000 * W, y0: y0 / 1000 * H, x1: x1 / 1000 * W, y1: y1 / 1000 * H }; };
const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// Titik ujung panah: di badan produk, di sisi yang menghadap label (bukan di tengah)
function ujungProduk(p, cx, cy) {
  const sx = (p.x1 - p.x0) * 0.22, sy = (p.y1 - p.y0) * 0.22;
  return { x: Math.min(Math.max(cx, p.x0 + sx), p.x1 - sx), y: Math.min(Math.max(cy, p.y0 + sy), p.y1 - sy) };
}
// Titik pangkal panah: tepi label yang menghadap produk
function pangkalLabel(l, t) {
  if (t.y > l.y + l.CH) return { x: Math.min(Math.max(t.x, l.x + 24), l.x + l.CW - 24), y: l.y + l.CH + 4 };
  if (t.y < l.y) return { x: Math.min(Math.max(t.x, l.x + 24), l.x + l.CW - 24), y: l.y - 4 };
  return t.x > l.x + l.CW / 2 ? { x: l.x + l.CW + 6, y: l.y + l.CH / 2 } : { x: l.x - 6, y: l.y + l.CH / 2 };
}

// Penempatan label: tiap produk punya banyak kandidat posisi di ruang kosong sekitar kotaknya,
// lalu dicari KOMBINASI terbaik untuk semua label sekaligus (tidak tumpang tindih, panah tidak silang,
// panjang panah seragam ~110 px). Hasilnya rapi dan konsisten, bukan sekadar "yang pertama dapat tempat".
const PANAH_IDEAL = 110, PANAH_MIN = 55, PANAH_MAKS_KERAS = 230;
function segRect(a, b, r) {
  // apakah garis a-b memotong persegi r (cek beberapa titik di sepanjang garis)
  for (let k = 0.15; k <= 0.85; k += 0.1) { const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k; if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true; }
  return false;
}
// Titik pin di produk: sedekat mungkin ke label, di dalam kotaknya sendiri, tapi TIDAK di atas produk lain
// (misal organizer yang berdiri di depan laptop stand)
function titikPin(p, lx, ly, prods) {
  const lain = prods.filter((q) => !(q.x0 === p.x0 && q.y0 === p.y0 && q.x1 === p.x1 && q.y1 === p.y1));
  let best = null;
  for (let fy = 0.2; fy <= 0.801; fy += 0.1) for (let fx = 0.2; fx <= 0.801; fx += 0.1) {
    const x = p.x0 + (p.x1 - p.x0) * fx, y = p.y0 + (p.y1 - p.y0) * fy;
    let c = Math.hypot(x - lx, y - ly);
    lain.forEach((q) => { if (x > q.x0 - 12 && x < q.x1 + 12 && y > q.y0 - 12 && y < q.y1 + 12 && (q.x1 - q.x0) * (q.y1 - q.y0) < (p.x1 - p.x0) * (p.y1 - p.y0)) c += 5000; });
    if (!best || c < best.c) best = { x, y, c };
  }
  return { x: best.x, y: best.y };
}

function layoutLabels(items, allBoxes, blok = [], lum = null) {
  const M = 24, TOP = 36, BOTTOM = H - 92;
  const prods = (allBoxes || items.map((i) => i.box)).map(toPx);
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  const blokR = blok.map((q) => ({ x0: q.x, y0: q.y, x1: q.x + q.CW, y1: q.y + q.CH }));
  const list = items.map((it) => ({ ...it, p: toPx(it.box), ...ukuranLabel(it) }));
  // 1) kandidat per produk + biaya sendiri
  for (const it of list) {
    const { p, CW, CH } = it;
    const raw = [];
    for (const g of [14, 30, 50, 75, 105, 140]) {
      for (const f of [0.5, 0.3, 0.7, 0.1, 0.9]) {
        raw.push({ x: p.x0 + (p.x1 - p.x0) * f - CW / 2, y: p.y0 - g - CH });
        raw.push({ x: p.x0 + (p.x1 - p.x0) * f - CW / 2, y: p.y1 + g });
        raw.push({ x: p.x0 - g - CW, y: p.y0 + (p.y1 - p.y0) * f - CH / 2 });
        raw.push({ x: p.x1 + g, y: p.y0 + (p.y1 - p.y0) * f - CH / 2 });
      }
      raw.push({ x: p.x0 - g - CW, y: p.y0 - g - CH }, { x: p.x1 + g, y: p.y0 - g - CH }, { x: p.x0 - g - CW, y: p.y1 + g }, { x: p.x1 + g, y: p.y1 + g });
    }
    const kand = [];
    for (const k of raw) {
      const x = Math.round(Math.min(Math.max(k.x, M), W - CW - M)), y = Math.round(Math.min(Math.max(k.y, TOP), BOTTOM - CH));
      const r = { x0: x, y0: y, x1: x + CW, y1: y + CH };
      const t = titikPin(p, x + CW / 2, y + CH / 2, prods), a = pangkalLabel({ x, y, CW, CH }, t);
      const L = Math.hypot(t.x - a.x, t.y - a.y);
      let c = 0;
      prods.forEach((pb) => { const luas = (pb.x1 - pb.x0) * (pb.y1 - pb.y0); c += inter(r, pb) * 60 * Math.min(1, (0.05 * W * H) / Math.max(luas, 1)); });
      blokR.forEach((q) => { c += inter({ x0: r.x0 - 14, y0: r.y0 - 10, x1: r.x1 + 14, y1: r.y1 + 10 }, q) * 600; });
      c += Math.abs(L - PANAH_IDEAL) * 30 + (L > PANAH_MAKS_KERAS ? (L - PANAH_MAKS_KERAS) * 3000 : 0) + (L < PANAH_MIN ? (PANAH_MIN - L) * 3000 : 0);
      c += keramaian(lum, r) * CW * CH * 0.02;
      // panah tidak boleh menembus kotak produk lain
      prods.forEach((pb) => { if (pb !== p && !(pb.x0 === p.x0 && pb.y0 === p.y0) && segRect(a, t, pb)) c += 15000; });
      kand.push({ x, y, a, t, r, c });
    }
    kand.sort((u, v) => u.c - v.c);
    const uniq = []; const seen = new Set();
    for (const k of kand) { const key = `${k.x},${k.y}`; if (!seen.has(key)) { seen.add(key); uniq.push(k); } if (uniq.length >= 30) break; }
    it.kand = uniq;
  }
  // 2) biaya antar-label
  const aman = (r) => ({ x0: r.x0 - 18, y0: r.y0 - 12, x1: r.x1 + 18, y1: r.y1 + 12 });
  const pair = (A, B) => {
    let c = inter(aman(A.r), B.r) * 2000;
    if (cross(A.a, A.t, B.a, B.t)) c += 4e5;
    if (segRect(A.a, A.t, B.r) || segRect(B.a, B.t, A.r)) c += 2e5;
    // label menutupi titik pin produk lain
    if (B.t.x > A.r.x0 - 16 && B.t.x < A.r.x1 + 16 && B.t.y > A.r.y0 - 16 && B.t.y < A.r.y1 + 16) c += 3e5;
    if (A.t.x > B.r.x0 - 16 && A.t.x < B.r.x1 + 16 && A.t.y > B.r.y0 - 16 && A.t.y < B.r.y1 + 16) c += 3e5;
    return c;
  };
  const total = (pilih) => {
    let c = 0;
    for (let i2 = 0; i2 < list.length; i2++) { c += list[i2].kand[pilih[i2]].c; for (let j2 = i2 + 1; j2 < list.length; j2++) c += pair(list[i2].kand[pilih[i2]], list[j2].kand[pilih[j2]]); }
    return c;
  };
  // 3) greedy acak berulang + perbaikan lokal; deterministik (seed tetap) supaya hasil render konsisten
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let terbaik = null, biayaTerbaik = Infinity;
  for (let iter = 0; iter < 120; iter++) {
    const urut = list.map((_, k) => k).sort((u, v) => (iter === 0 ? list[u].kand[0].c - list[v].kand[0].c : rnd() - 0.5));
    const pilih = new Array(list.length).fill(0), sudah = [];
    for (const k of urut) {
      let bk = 0, bc = Infinity;
      list[k].kand.forEach((cand, ci) => { let c = cand.c; sudah.forEach((q) => { c += pair(cand, list[q].kand[pilih[q]]); }); if (c < bc) { bc = c; bk = ci; } });
      pilih[k] = bk; sudah.push(k);
    }
    for (let pass = 0; pass < 3; pass++) {
      let membaik = false;
      for (let k = 0; k < list.length; k++) {
        let bk = pilih[k], bc = total(pilih);
        for (let ci = 0; ci < list[k].kand.length; ci++) { const lama = pilih[k]; pilih[k] = ci; const c = total(pilih); if (c < bc) { bc = c; bk = ci; membaik = true; } pilih[k] = lama; }
        pilih[k] = bk;
      }
      if (!membaik) break;
    }
    const c = total(pilih);
    if (c < biayaTerbaik) { biayaTerbaik = c; terbaik = [...pilih]; }
  }
  return list.map((it, k) => { const b = it.kand[terbaik[k]]; return { ...it, x: b.x, y: b.y, a: b.a, t: b.t, cx: (it.p.x0 + it.p.x1) / 2, cy: (it.p.y0 + it.p.y1) / 2 }; });
}

function slidePeta(d) {
  const withBox = (d.items || []).filter((i) => Array.isArray(i.box) && i.box.length === 4);
  const noBox = (d.items || []).filter((i) => !(Array.isArray(i.box) && i.box.length === 4));
  // produk yang tidak ketemu di foto: label tanpa panah di kiri atas
  const tanpaPin = noBox.map((p, k) => ({ ...p, ...ukuranLabel(p), noPin: true, x: 26, y: 40 + k * 84 }));
  const items = [...layoutLabels(withBox, d.allBoxes, tanpaPin, d.lum), ...tanpaPin]
    .map((p) => ({ ...p, w: warnaLabel(d.lum, { x0: p.x, y0: p.y, x1: p.x + p.CW, y1: p.y + p.CH }) }));
  const panah = items.filter((p) => !p.noPin).map((p) => {
    const { a, t } = p;
    const dx = t.x - a.x, dy = t.y - a.y, L = Math.hypot(dx, dy) || 1;
    // lengkung lembut ke satu sisi, seperti coretan tangan
    const c = { x: (a.x + t.x) / 2 - dy / L * Math.min(34, L * 0.28), y: (a.y + t.y) / 2 + dx / L * Math.min(34, L * 0.28) };
    // kepala panah di sisi LABEL (arah singgung dari titik kontrol ke pangkal), titik bulat di produk
    const ux = a.x - c.x, uy = a.y - c.y, UL = Math.hypot(ux, uy) || 1;
    const nx = ux / UL, ny = uy / UL, k = 15, lebar = 8;
    const kepala = `M ${a.x - nx * k - ny * lebar} ${a.y - ny * k + nx * lebar} L ${a.x} ${a.y} L ${a.x - nx * k + ny * lebar} ${a.y - ny * k - nx * lebar}`;
    const garis = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${t.x} ${t.y}`;
    return [
      el('path', { d: garis, stroke: p.w.halo, strokeWidth: 7, fill: 'none', strokeLinecap: 'round', opacity: 0.55 }),
      el('path', { d: kepala, stroke: p.w.halo, strokeWidth: 7, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.55 }),
      el('circle', { cx: t.x, cy: t.y, r: 10, fill: p.w.halo, opacity: 0.7 }),
      el('path', { d: garis, stroke: p.w.teks, strokeWidth: 3.2, fill: 'none', strokeLinecap: 'round' }),
      el('path', { d: kepala, stroke: p.w.teks, strokeWidth: 3.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
      el('circle', { cx: t.x, cy: t.y, r: 6.5, fill: p.w.teks }),
    ];
  }).flat();
  const bayang = (w) => `0 2px 8px ${w.halo}, 0 0 3px ${w.halo}`;
  return h('div', { width: W, height: H, position: 'relative', backgroundColor: C.ink }, [
    bg(d.img),
    svg(W, H, panah, { position: 'absolute', top: 0, left: 0 }),
    ...items.map((p) => h('div', { position: 'absolute', left: p.x, top: p.y, width: p.CW, height: p.CH, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }, [
      h('div', { alignItems: 'baseline', gap: 7, maxWidth: p.CW }, [
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 19, color: p.w.angka, textShadow: bayang(p.w) }, pad(p.pin)),
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: FN, lineHeight: 1.05, color: p.w.teks, textShadow: bayang(p.w), letterSpacing: -0.8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, p.nama),
      ]),
      h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: FP, lineHeight: 1.1, color: p.w.teks, textShadow: bayang(p.w), letterSpacing: -0.6 }, rupiah(p.harga) || 'cek harga di link bio'),
    ])),
    d.page ? h('div', { position: 'absolute', left: 30, bottom: 30, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 18, color: C.cream,
      backgroundColor: 'rgba(42,32,27,0.45)', borderRadius: 999, padding: '6px 14px', opacity: 0.85 }, d.page) : null,
    watermark(),
  ].filter(Boolean));
}

function barisStruk(i, rowSize) {
  return h('div', { justifyContent: 'space-between', alignItems: 'center', gap: 16 }, [
    h('div', { alignItems: 'center', gap: 14, flex: 1, overflow: 'hidden' }, [
      h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: rowSize - 4, color: '#B86A35', width: 34 }, pad(i.pin)),
      h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: rowSize, color: C.ink, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 520 }, i.nama),
    ]),
    h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: rowSize, color: C.ink }, rupiah(i.harga) || '-'),
  ]);
}

// Isi struk: biasa (daftar + TOTAL) atau per versi (format banding: tiap versi punya subtotal)
function badanStruk(d, items, total, rowSize, dash) {
  const grup = Array.isArray(d.grup) && d.grup.length > 1 ? d.grup : null;
  if (!grup) return [
    ...items.map((i) => barisStruk(i, rowSize)),
    dash,
    h('div', { justifyContent: 'space-between', alignItems: 'baseline' }, [
      h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 26, color: C.ink, letterSpacing: 2 }, 'TOTAL ±'),
      h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 44, color: C.ink }, rupiah(total)),
    ]),
  ];
  const kecil = Math.min(rowSize, 23);
  return grup.flatMap((g, k) => {
    const isi = items.filter((i) => (g.pins || []).includes(Number(i.pin)));
    const sub = isi.reduce((s2, i) => s2 + (Number(i.harga) || 0), 0);
    return [
      ...(k ? [dash] : []),
      h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 18, letterSpacing: 2.5, color: '#B86A35', textTransform: 'uppercase' }, g.label || `Versi ${k + 1}`),
      ...isi.map((i) => barisStruk(i, kecil)),
      h('div', { justifyContent: 'space-between', alignItems: 'baseline' }, [
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 20, color: C.ink, letterSpacing: 2 }, 'SUBTOTAL ±'),
        h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 34, color: C.ink }, rupiah(sub)),
      ]),
    ];
  });
}

function slideStruk(d) {
  const items = d.items || [];
  const total = items.reduce((s, i) => s + (Number(i.harga) || 0), 0);
  const dash = h('div', { width: '100%', height: 0, borderTop: `2px dashed ${C.line}` });
  const rowSize = items.length > 6 ? 23 : 26;
  return h('div', { width: W, height: H, position: 'relative', backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }, [
    bg(d.img),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: 'rgba(30,22,17,0.62)' }),
    h('div', { position: 'absolute', left: 120, right: 120, top: 90, flexDirection: 'column', gap: 26, alignItems: 'center' }, [
      h('div', { width: 840, flexDirection: 'column', backgroundColor: C.paper, borderRadius: 8, padding: '40px 48px 36px', gap: 16,
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }, [
        h('div', { justifyContent: 'space-between', alignItems: 'center' }, [
          h('div', { alignItems: 'center', gap: 10 }, [logoMark(40, C.ink), h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 30, color: C.ink }, 'produktif glow')]),
          h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 18, letterSpacing: 3, color: C.muted }, 'STRUK'),
        ]),
        h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 22, color: C.muted }, d.judul || ''),
        dash,
        ...badanStruk(d, items, total, rowSize, dash),
        h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 19, color: C.muted, lineHeight: 1.45 },
          d.disclaimer || 'Barang di link bio adalah pilihan paling mirip yang harganya masih masuk akal, jadi bisa beda tipis dengan yang di foto. Harga ikut marketplace dan bisa berubah sewaktu-waktu.'),
      ]),
      h('div', { flexDirection: 'column', alignItems: 'center', gap: 10 }, [
        h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 52, color: C.cream, textAlign: 'center' }, d.cta || 'Simpan dulu, checkout pas gajian.'),
        h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 26, color: 'rgba(247,241,232,0.85)', textAlign: 'center' }, d.cta2 || 'Follow @produktif.glow · semua link ada di bio'),
      ]),
    ]),
    watermark(),
  ]);
}

// Satukan data: items (pin, nama, harga) + boxes hasil deteksi ({pin, box_2d}), lalu pilih bagian slide
function normalize(input) {
  let d = { ...input };
  // "meta" = JSON keluaran content agent; isi otomatis kolom yang belum ada
  if (d.meta && typeof d.meta === 'object') {
    const m = d.meta;
    d.items = d.items || m.produk || m.landing;
    d.kicker = d.kicker || m.hook_kicker || 'Ruang Kerja';
    d.judul = d.judul || (d.slide === 'hook' ? m.hook_judul : m.tema);
    d.sub = d.sub || m.hook_sub;
    d.cta = d.cta || m.cta;
  }
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(/[^0-9]/g, '')) || null);
  const boxes = {};
  (d.boxes || []).forEach((b) => { const k = Number(b.pin); const bx = b.box_2d || b.box; if (Array.isArray(bx) && bx.length === 4) boxes[k] = bx.map(Number); });
  let items = (d.items || []).map((i) => ({ ...i, pin: Number(i.pin), harga: num(i.harga), nama: String(i.nama || i.nama_label || '').trim(), box: i.box || boxes[Number(i.pin)] }))
    .filter((i) => i.pin && i.nama).sort((a, b) => a.pin - b.pin);
  const all = items;
  if (d.slide === 'peta' && d.part) {
    const n = items.length, first = n <= 5 ? n : Math.ceil(n / 2);
    items = Number(d.part) === 2 ? items.slice(first) : items.slice(0, first);
    if (!d.page && items.length) d.page = `Barang ${pad(items[0].pin)}${items.length > 1 ? '–' + pad(items[items.length - 1].pin) : ''}`;
  }
  return { ...d, items, allBoxes: d.allBoxes || all.filter((i) => i.box).map((i) => i.box) };
}

// Slide khusus QC (tidak diposting): semua pin + daftar nomor-nama, untuk dicek agent QC
function slideQc(d) {
  const items = d.items || [];
  return h('div', { width: W, height: H, position: 'relative', backgroundColor: C.ink }, [
    bg(d.img),
    ...items.filter((p) => p.box).map((p) => {
      const [y0, x0, y1, x1] = p.box; const bx = x0 / 1000 * W, by = y0 / 1000 * H, bw = (x1 - x0) / 1000 * W, bh = (y1 - y0) / 1000 * H;
      return h('div', { position: 'absolute', left: bx, top: by, width: bw, height: bh, border: '3px solid #FFD400', alignItems: 'flex-start', justifyContent: 'flex-start' }, [
        h('div', { backgroundColor: '#FFD400', color: '#000', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 30, padding: '2px 10px' }, pad(p.pin)),
      ]);
    }),
    h('div', { position: 'absolute', left: 20, bottom: 20, flexDirection: 'column', gap: 4, backgroundColor: 'rgba(0,0,0,0.75)', padding: '14px 18px', borderRadius: 10 },
      items.map((p) => h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 24, color: p.box ? '#FFD400' : '#FF7A7A' }, `${pad(p.pin)}  ${p.nama}${p.box ? '' : '  (tidak terdeteksi)'}`))),
  ]);
}

// Panduan tata letak untuk AI gambar: kotak warna bernomor di posisi rencana (tidak diposting)
const WARNA_TATA = ['#E4572E', '#29335C', '#F3A712', '#669BBC', '#A8C686', '#8E5572', '#2EC4B6', '#5C4033'];
function slideTata(d) {
  return h('div', { width: W, height: H, position: 'relative', backgroundColor: '#E9E4DC' }, [
    h('div', { position: 'absolute', left: 0, top: Math.round(H * 0.42), width: W, height: H - Math.round(H * 0.42), backgroundColor: '#CDB8A0' }),
    ...(d.boxes || []).map((b, i) => {
      const [y0, x0, y1, x1] = b.box_2d;
      const bx = x0 / 1000 * W, by = y0 / 1000 * H, bw = (x1 - x0) / 1000 * W, bh = (y1 - y0) / 1000 * H;
      return h('div', { position: 'absolute', left: bx, top: by, width: bw, height: bh, backgroundColor: WARNA_TATA[i % WARNA_TATA.length],
        borderRadius: 18, alignItems: 'center', justifyContent: 'center', border: '4px solid #FFFFFF' }, [
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: Math.max(40, Math.min(110, bw * 0.5)), color: '#FFFFFF' }, String(b.pin)),
      ]);
    }),
  ]);
}

export function renderSlide(input) {
  const d = normalize(input);
  const tree = d.slide === 'tata' ? slideTata(d) : d.slide === 'hook' ? slideHook(d) : d.slide === 'struk' ? slideStruk(d) : d.slide === 'qc' ? slideQc(d) : slidePeta(d);
  return new ImageResponse(tree, { width: W, height: H, fonts: FONTS });
}
