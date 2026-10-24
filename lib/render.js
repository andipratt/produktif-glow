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

// Hitung posisi kartu label: pilih posisi yang paling sedikit menutupi produk lain dan kartu lain
function layoutLabels(items, allBoxes) {
  const CW = 380, CH = 92, M = 24, TOP = 40, BOTTOM = H - 90;
  const toPx = (b) => { const [y0, x0, y1, x1] = b.map(Number); return { x0: x0 / 1000 * W, y0: y0 / 1000 * H, x1: x1 / 1000 * W, y1: y1 / 1000 * H }; };
  const prods = (allBoxes || items.map((i) => i.box)).map(toPx);
  const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const placed = [];
  const order = items.map((it) => { const p = toPx(it.box); return { ...it, p, cx: (p.x0 + p.x1) / 2, cy: (p.y0 + p.y1) / 2 }; })
    .sort((a, b) => a.cy - b.cy);
  for (const it of order) {
    let best = null;
    const xs = [it.p.x1 + 36, it.p.x0 - 36 - CW, it.cx - CW / 2];
    const ys = [it.cy - CH / 2, it.p.y0 - CH - 30, it.p.y1 + 30, it.cy - CH * 1.6, it.cy + CH * 0.6];
    for (const x0 of xs) for (const y0 of ys) {
      const x = Math.min(Math.max(x0, M), W - CW - M), y = Math.min(Math.max(y0, TOP), BOTTOM - CH);
      const r = { x0: x, y0: y, x1: x + CW, y1: y + CH };
      let s = 0;
      prods.forEach((pb) => { s += inter(r, pb) * 1.0; });
      placed.forEach((q) => { s += inter(r, { x0: q.x, y0: q.y, x1: q.x + CW, y1: q.y + CH }) * 8; });
      // jangan menutupi pin sendiri / produk sendiri
      if (it.cx > r.x0 - 30 && it.cx < r.x1 + 30 && it.cy > r.y0 - 30 && it.cy < r.y1 + 30) s += 1e7;
      s += Math.hypot((x + CW / 2) - it.cx, (y + CH / 2) - it.cy) * 20; // dekat lebih baik
      if (!best || s < best.s) best = { s, x, y };
    }
    placed.push({ ...it, x: best.x, y: best.y, CW, CH, side: best.x + CW / 2 > it.cx ? 'right' : 'left' });
  }
  return placed;
}

function slidePeta(d) {
  const withBox = (d.items || []).filter((i) => Array.isArray(i.box) && i.box.length === 4);
  const noBox = (d.items || []).filter((i) => !(Array.isArray(i.box) && i.box.length === 4));
  const items = layoutLabels(withBox, d.allBoxes);
  // produk yang posisinya tidak terdeteksi: tampil sebagai kartu tanpa panah di kiri bawah
  noBox.forEach((p, k) => items.push({ ...p, noPin: true, x: 24, y: H - 110 - (noBox.length - k) * 106, CW: 380, CH: 92, cx: 0, cy: 0 }));
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
    ...items.filter((p) => !p.noPin).map((p) => h('div', { position: 'absolute', left: p.cx - 24, top: p.cy - 24, width: 48, height: 48, borderRadius: 999,
      backgroundColor: C.ink, border: `3px solid ${C.cream}`, alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 20, color: C.cream }, pad(p.pin))),
    ...items.map((p) => h('div', { position: 'absolute', left: p.x, top: p.y, width: p.CW, height: p.CH, flexDirection: 'column', justifyContent: 'center',
      backgroundColor: 'rgba(251,247,241,0.94)', borderRadius: 16, padding: '0 20px', gap: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }, [
      h('div', { alignItems: 'center', gap: 10 }, [
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 18, color: C.glow === '#E3A06F' ? '#B86A35' : C.glow }, pad(p.pin)),
        h('div', { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 23, color: C.ink, maxWidth: 300, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, p.nama),
      ]),
      h('div', { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 21, color: C.muted }, rupiah(p.harga) || 'cek harga di link bio'),
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
function normalize(d) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(/[^0-9]/g, '')) || null);
  const boxes = {};
  (d.boxes || []).forEach((b) => { const k = Number(b.pin); const bx = b.box_2d || b.box; if (Array.isArray(bx) && bx.length === 4) boxes[k] = bx.map(Number); });
  let items = (d.items || []).map((i) => ({ ...i, pin: Number(i.pin), harga: num(i.harga), nama: String(i.nama || i.nama_label || '').trim(), box: i.box || boxes[Number(i.pin)] }))
    .filter((i) => i.pin && i.nama).sort((a, b) => a.pin - b.pin);
  const all = items;
  if (d.slide === 'peta' && d.part) {
    const n = items.length, first = n <= 4 ? n : Math.ceil(n / 2);
    items = Number(d.part) === 2 ? items.slice(first) : items.slice(0, first);
    if (!d.page && items.length) d.page = `Barang ${pad(items[0].pin)}${items.length > 1 ? '–' + pad(items[items.length - 1].pin) : ''}`;
  }
  return { ...d, items, allBoxes: d.allBoxes || all.filter((i) => i.box).map((i) => i.box) };
}

export function renderSlide(input) {
  const d = normalize(input);
  const tree = d.slide === 'hook' ? slideHook(d) : d.slide === 'struk' ? slideStruk(d) : slidePeta(d);
  return new ImageResponse(tree, { width: W, height: H, fonts: FONTS });
}
