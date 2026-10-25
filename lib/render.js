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

// Hitung posisi kartu label: pilih posisi yang paling sedikit menutupi produk, pin, dan kartu lain
function layoutLabels(items, allBoxes, blok = []) {
  const CW = 312, CH = 78, M = 22, TOP = 34, BOTTOM = H - 84;
  const toPx = (b) => { const [y0, x0, y1, x1] = b.map(Number); return { x0: x0 / 1000 * W, y0: y0 / 1000 * H, x1: x1 / 1000 * W, y1: y1 / 1000 * H }; };
  const prods = (allBoxes || items.map((i) => i.box)).map(toPx);
  const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const anchored = anchorPins(items, toPx);
  const placed = [];
  const order = anchored.sort((a, b) => a.cy - b.cy);
  // garis penunjuk saling silang = membingungkan
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  const end = (it, x, y) => ({ x: Math.min(Math.max(it.cx, x + 12), x + CW - 12), y: Math.min(Math.max(it.cy, y + 10), y + CH - 10) });
  for (const it of order) {
    let best = null;
    const xs = [it.cx + 60, it.cx - 60 - CW, it.cx - CW / 2, M, W - CW - M];
    const ys = [it.cy - CH / 2, it.cy - CH - 60, it.cy + 60, it.cy - CH * 2.2, it.cy + CH * 1.4, TOP, BOTTOM - CH];
    for (const x0 of xs) for (const y0 of ys) {
      const x = Math.min(Math.max(x0, M), W - CW - M), y = Math.min(Math.max(y0, TOP), BOTTOM - CH);
      const r = { x0: x, y0: y, x1: x + CW, y1: y + CH };
      let s = 0;
      prods.forEach((pb) => { s += inter(r, pb) * 0.6; });
      blok.forEach((q) => { s += inter({ x0: r.x0 - 14, y0: r.y0 - 14, x1: r.x1 + 14, y1: r.y1 + 14 }, { x0: q.x, y0: q.y, x1: q.x + q.CW, y1: q.y + q.CH }) * 400; });
      placed.forEach((q) => {
        s += inter({ x0: r.x0 - 14, y0: r.y0 - 14, x1: r.x1 + 14, y1: r.y1 + 14 }, { x0: q.x, y0: q.y, x1: q.x + CW, y1: q.y + CH }) * 400;
        const e1 = end(it, x, y), e2 = end(q, q.x, q.y);
        if (cross({ x: it.cx, y: it.cy }, e1, { x: q.cx, y: q.cy }, e2)) s += 4e5;
      });
      // kartu tidak boleh menutupi pin mana pun
      anchored.forEach((q) => { if (q.cx > r.x0 - 34 && q.cx < r.x1 + 34 && q.cy > r.y0 - 34 && q.cy < r.y1 + 34) s += 1e7; });
      s += Math.hypot((x + CW / 2) - it.cx, (y + CH / 2) - it.cy) * 14; // dekat lebih baik
      if (!best || s < best.s) best = { s, x, y };
    }
    placed.push({ ...it, x: best.x, y: best.y, CW, CH });
  }
  return placed;
}

function slidePeta(d) {
  const withBox = (d.items || []).filter((i) => Array.isArray(i.box) && i.box.length === 4);
  const noBox = (d.items || []).filter((i) => !(Array.isArray(i.box) && i.box.length === 4));
  // produk yang tidak ketemu di foto: kartu tanpa pin di kiri atas (biasanya dinding kosong), dihindari kartu lain
  const kartuTanpaPin = noBox.map((p, k) => ({ ...p, noPin: true, x: 22, y: 34 + k * 90, CW: 312, CH: 78, cx: 0, cy: 0 }));
  const items = [...layoutLabels(withBox, d.allBoxes, kartuTanpaPin), ...kartuTanpaPin];
  const lines = items.filter((p) => !p.noPin).map((p) => {
    const ex = Math.min(Math.max(p.cx, p.x + 12), p.x + p.CW - 12);
    const ey = Math.min(Math.max(p.cy, p.y + 10), p.y + p.CH - 10);
    return [
      el('line', { x1: p.cx, y1: p.cy, x2: ex, y2: ey, stroke: '#FFFFFF', strokeWidth: 5, strokeLinecap: 'round', opacity: 0.55 }),
      el('line', { x1: p.cx, y1: p.cy, x2: ex, y2: ey, stroke: C.ink, strokeWidth: 2.5, strokeLinecap: 'round' }),
    ];
  }).flat();
  return h('div', { width: W, height: H, position: 'relative', backgroundColor: C.ink }, [
    bg(d.img),
    svg(W, H, lines, { position: 'absolute', top: 0, left: 0 }),
    ...items.filter((p) => !p.noPin).map((p) => h('div', { position: 'absolute', left: p.cx - 22, top: p.cy - 22, width: 44, height: 44, borderRadius: 999,
      backgroundColor: C.ink, border: `3px solid ${C.cream}`, alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 20, color: C.cream }, pad(p.pin))),
    ...items.map((p) => h('div', { position: 'absolute', left: p.x, top: p.y, width: p.CW, height: p.CH, flexDirection: 'column', justifyContent: 'center',
      backgroundColor: 'rgba(251,247,241,0.94)', borderRadius: 14, padding: '0 16px', gap: 2, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }, [
      h('div', { alignItems: 'center', gap: 10 }, [
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 16, color: '#B86A35' }, pad(p.pin)),
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 20, color: C.ink, maxWidth: 250, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, p.nama),
      ]),
      h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 19, color: C.muted }, rupiah(p.harga) || 'cek harga di link bio'),
    ])),
    d.page ? h('div', { position: 'absolute', left: 30, bottom: 30, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 18, color: C.cream,
      backgroundColor: 'rgba(42,32,27,0.45)', borderRadius: 999, padding: '6px 14px', opacity: 0.85 }, d.page) : null,
    watermark(),
  ].filter(Boolean));
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
        ...items.map((i) => h('div', { justifyContent: 'space-between', alignItems: 'center', gap: 16 }, [
          h('div', { alignItems: 'center', gap: 14, flex: 1, overflow: 'hidden' }, [
            h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: rowSize - 4, color: '#B86A35', width: 34 }, pad(i.pin)),
            h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: rowSize, color: C.ink, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 520 }, i.nama),
          ]),
          h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: rowSize, color: C.ink }, rupiah(i.harga) || '-'),
        ])),
        dash,
        h('div', { justifyContent: 'space-between', alignItems: 'baseline' }, [
          h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 26, color: C.ink, letterSpacing: 2 }, 'TOTAL ±'),
          h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 44, color: C.ink }, rupiah(total)),
        ]),
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
    d.kicker = d.kicker || m.hook_kicker || (m.kategori === 'skincare' ? 'Skincare' : 'Meja Kerja');
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
