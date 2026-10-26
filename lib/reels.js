// Reels 9:16 digambar frame demi frame di canvas (gerak kamera mulus, tanpa getar), lalu di-encode ffmpeg.
// Alur: judul -> tiap produk (zoom out di sudut lain, zoom in ke produk, label; aturan meja diketik) -> struk keluar dari printer.
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fraunces600, dmsans500, dmsans700 } from './fonts.js';
import { BRAND } from './brand.js';

const W = 1080, H = 1920, FPS = 30, XF = 0.3;
const C = { ink: '#2A201B', cream: '#F7F1E8', glow: '#E3A06F', paper: '#FBF7F1' };

let fontSiap = false;
function daftarFont() {
  if (fontSiap) return;
  GlobalFonts.register(Buffer.from(fraunces600, 'base64'), 'NgFraunces');
  GlobalFonts.register(Buffer.from(dmsans500, 'base64'), 'NgSans5');
  GlobalFonts.register(Buffer.from(dmsans700, 'base64'), 'NgSans7');
  fontSiap = true;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpV = (a, b, t) => ({ cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), s: lerp(a.s, b.s, t) });
export const rupiah = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '' : 'Rp' + Number(n).toLocaleString('id-ID').replace(/,/g, '.');
const pad = (n) => String(n).padStart(2, '0');

// ---------- kamera ----------
function sCover(img) { return Math.max(W / img.width, H / img.height); }
function rapikanView(img, v) {
  const s = Math.max(v.s, sCover(img));
  const hw = W / 2 / s, hh = H / 2 / s;
  return { s, cx: clamp(v.cx, hw, img.width - hw), cy: clamp(v.cy, hh, img.height - hh) };
}
function gambarFoto(ctx, img, v) {
  const r = rapikanView(img, v);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, W / 2 - r.cx * r.s, H / 2 - r.cy * r.s, img.width * r.s, img.height * r.s);
  return r;
}
const kePx = (img, b) => ({ x0: b[1] / 1000 * img.width, y0: b[0] / 1000 * img.height, x1: b[3] / 1000 * img.width, y1: b[2] / 1000 * img.height });
function viewLebar(img, boxes) {
  // tengah = rata-rata posisi produk, supaya produk tidak terpotong saat foto 4:5 dipotong jadi 9:16
  const bs = Object.values(boxes || {}).map((b) => kePx(img, b));
  const cx = bs.length ? bs.reduce((s, b) => s + (b.x0 + b.x1) / 2, 0) / bs.length : img.width / 2;
  return rapikanView(img, { cx, cy: img.height / 2, s: sCover(img) });
}
function viewProduk(img, b) {
  const p = kePx(img, b), bw = p.x1 - p.x0, bh = p.y1 - p.y0, s0 = sCover(img);
  const s = clamp(Math.min(W * 0.68 / bw, H * 0.42 / bh), s0 * 1.2, s0 * 1.9);
  return rapikanView(img, { cx: (p.x0 + p.x1) / 2, cy: (p.y0 + p.y1) / 2 + 0.06 * H / s, s });
}
// posisi titik foto di layar untuk view tertentu
const keLayar = (r, x, y) => ({ x: W / 2 + (x - r.cx) * r.s, y: H / 2 + (y - r.cy) * r.s });

// ---------- teks ----------
function bungkus(ctx, teks, maxW) {
  const kata = String(teks || '').split(/\s+/).filter(Boolean); const baris = []; let cur = '';
  for (const k of kata) { const coba = cur ? cur + ' ' + k : k; if (ctx.measureText(coba).width > maxW && cur) { baris.push(cur); cur = k; } else cur = coba; }
  if (cur) baris.push(cur);
  return baris;
}
function teksBayang(ctx, teks, x, y, warna = C.cream, blur = 18) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = blur; ctx.shadowOffsetY = 2; ctx.fillStyle = warna; ctx.fillText(teks, x, y); ctx.restore();
}
function kotakBulat(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function gradasiBawah(ctx, mulai, kuat) {
  const g = ctx.createLinearGradient(0, mulai, 0, H);
  g.addColorStop(0, 'rgba(20,14,10,0)'); g.addColorStop(0.45, `rgba(20,14,10,${kuat * 0.55})`); g.addColorStop(1, `rgba(20,14,10,${kuat})`);
  ctx.fillStyle = g; ctx.fillRect(0, mulai, W, H - mulai);
}
function watermark(ctx) {
  ctx.save(); ctx.globalAlpha = 0.7; ctx.font = '500 26px NgSans5'; ctx.textAlign = 'right';
  teksBayang(ctx, BRAND.handle, W - 44, H - 60, C.cream, 10); ctx.restore();
}

// ---------- klip ----------
function klipJudul(img, boxes, d) {
  const v0 = viewLebar(img, boxes), v1 = { ...v0, s: v0.s * 1.07 };
  const dur = 3.0;
  return { dur, draw(ctx, t) {
    gambarFoto(ctx, img, lerpV(v0, v1, t / dur));
    gradasiBawah(ctx, H * 0.38, 0.9);
    const x = 84; let y = H - 300;
    ctx.font = '600 92px NgFraunces';
    const baris = bungkus(ctx, d.judul, W - 2 * x).slice(0, 4);
    ctx.font = '500 38px NgSans5';
    const sub = d.sub ? bungkus(ctx, d.sub, W - 2 * x).slice(0, 3) : [];
    y = H - 230 - sub.length * 50 - baris.length * 96;
    const a1 = easeOut(clamp((t - 0.15) / 0.5, 0, 1)), a2 = easeOut(clamp((t - 0.45) / 0.5, 0, 1)), a3 = easeOut(clamp((t - 0.8) / 0.5, 0, 1));
    ctx.save(); ctx.globalAlpha = a1; ctx.fillStyle = C.glow; ctx.fillRect(x, y - 60 + (1 - a1) * 20, 44, 4);
    ctx.font = '700 30px NgSans7'; ctx.textBaseline = 'alphabetic'; teksBayang(ctx, String(d.kicker || BRAND.nama).toUpperCase().split('').join(' '), x + 60, y - 48 + (1 - a1) * 20, C.glow, 8); ctx.restore();
    ctx.save(); ctx.globalAlpha = a2; ctx.font = '600 92px NgFraunces';
    baris.forEach((b, i) => teksBayang(ctx, b, x, y + 70 + i * 96 + (1 - a2) * 30)); ctx.restore();
    ctx.save(); ctx.globalAlpha = a3; ctx.font = '500 38px NgSans5';
    sub.forEach((b, i) => teksBayang(ctx, b, x, y + 70 + baris.length * 96 + 30 + i * 50 + (1 - a3) * 20, 'rgba(247,241,232,0.92)', 10)); ctx.restore();
    watermark(ctx);
  } };
}

function klipVersi(img, boxes, label) {
  const v0 = viewLebar(img, boxes), vA = { ...v0, s: v0.s * 1.12 };
  return { dur: 1.4, draw(ctx, t) {
    gambarFoto(ctx, img, lerpV(vA, v0, easeOut(clamp(t / 0.8, 0, 1))));
    ctx.fillStyle = 'rgba(20,14,10,0.45)'; ctx.fillRect(0, 0, W, H);
    const a = easeOut(clamp((t - 0.1) / 0.4, 0, 1));
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.font = '700 32px NgSans7'; teksBayang(ctx, 'V E R S I', W / 2, H / 2 - 70, C.glow, 8);
    ctx.font = '600 110px NgFraunces'; teksBayang(ctx, String(label || '').replace(/^versi\s*/i, ''), W / 2, H / 2 + 50 + (1 - a) * 30);
    ctx.restore(); watermark(ctx);
  } };
}

function klipProduk(img, boxes, titik, p, ins, versi) {
  const vW = viewLebar(img, boxes), vOut = { ...vW, s: vW.s * 1.12 }, vP = viewProduk(img, boxes[p.pin]);
  const T_OUT = 0.4, T_IN0 = 0.5, T_IN1 = 1.1;
  const isi = ins ? String(ins.isi || '') : '';
  const tKetik = ins ? 1.35 + isi.length / 30 : 0;
  const dur = ins ? Math.max(2.6, tKetik + 1.3) : 2.4;
  const b = kePx(img, boxes[p.pin]);
  const tp = titik && titik[p.pin] ? { x: titik[p.pin][1] / 1000 * img.width, y: titik[p.pin][0] / 1000 * img.height } : { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  return { dur, draw(ctx, t) {
    let v;
    if (t < T_OUT) v = lerpV(vOut, vW, easeOut(t / T_OUT));
    else if (t < T_IN0) v = vW;
    else if (t < T_IN1) v = lerpV(vW, vP, ease((t - T_IN0) / (T_IN1 - T_IN0)));
    else v = { ...vP, s: vP.s * (1 + 0.012 * (t - T_IN1)) };
    const r = gambarFoto(ctx, img, v);
    // titik pin di produk
    const aDot = clamp((t - 0.95) / 0.25, 0, 1);
    if (aDot > 0) {
      const q = keLayar(r, tp.x, tp.y), puls = (t - 0.95) % 1.2;
      ctx.save(); ctx.globalAlpha = aDot * (1 - puls / 1.2) * 0.8; ctx.strokeStyle = C.cream; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(q.x, q.y, 12 + puls * 28, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.globalAlpha = aDot; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
      ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.glow; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // label produk di bawah
    const aL = easeOut(clamp((t - 1.05) / 0.4, 0, 1));
    if (aL > 0) {
      gradasiBawah(ctx, H * 0.62, 0.85 * aL);
      ctx.save(); ctx.globalAlpha = aL; const dy = (1 - aL) * 30; const x = 84;
      ctx.font = '600 76px NgFraunces'; const harga = rupiah(p.harga) || 'cek di link bio';
      ctx.font = '700 50px NgSans7'; const nb = bungkus(ctx, p.nama, W - 2 * x).slice(0, 2);
      let y = H - 190 - nb.length * 60;
      ctx.font = '700 30px NgSans7'; teksBayang(ctx, pad(p.pin) + (p.jenis ? '  ·  ' + String(p.jenis).toUpperCase() : ''), x, y - 70 + dy, C.glow, 8);
      ctx.font = '700 50px NgSans7'; nb.forEach((s, i) => teksBayang(ctx, s, x, y + i * 60 + dy));
      ctx.font = '600 76px NgFraunces'; teksBayang(ctx, harga, x, y + nb.length * 60 + 50 + dy);
      ctx.restore();
    }
    // aturan meja diketik
    if (ins) {
      const aI = easeOut(clamp((t - 1.15) / 0.35, 0, 1));
      if (aI > 0) {
        const x = 64, w = W - 128;
        ctx.font = '500 38px NgSans5';
        const semua = bungkus(ctx, isi, w - 88);
        const tinggi = 170 + semua.length * 52;
        ctx.save(); ctx.globalAlpha = aI;
        kotakBulat(ctx, x, 150 - (1 - aI) * 20, w, tinggi, 28); ctx.fillStyle = 'rgba(251,247,241,0.94)'; ctx.fill();
        ctx.fillStyle = '#B0632D'; ctx.font = '700 26px NgSans7'; ctx.fillText('A T U R A N   M E J A', x + 44, 212 - (1 - aI) * 20);
        ctx.fillStyle = C.ink; ctx.font = '600 50px NgFraunces'; ctx.fillText(String(ins.judul || '').slice(0, 34), x + 44, 276 - (1 - aI) * 20);
        // ketik huruf demi huruf, lalu kursor berkedip
        const n = Math.floor(clamp((t - 1.35) * 30, 0, isi.length));
        let sisa = n; ctx.font = '500 38px NgSans5'; ctx.fillStyle = '#4A3B31';
        let lastX = x + 44, lastY = 340;
        semua.forEach((bar, i) => {
          if (sisa <= 0) return;
          const potong = bar.slice(0, sisa); sisa -= bar.length + 1;
          ctx.fillText(potong, x + 44, 340 + i * 52); lastX = x + 44 + ctx.measureText(potong).width; lastY = 340 + i * 52;
        });
        if (n === 0 || Math.floor(t * 2.5) % 2 === 0 || n < isi.length) { ctx.fillStyle = '#B0632D'; ctx.fillRect(lastX + 4, lastY - 34, 4, 42); }
        ctx.restore();
      }
    }
    if (versi) {
      ctx.save(); ctx.font = '700 28px NgSans7'; const tw = ctx.measureText(versi).width;
      kotakBulat(ctx, W - tw - 104, 64, tw + 48, 54, 27); ctx.fillStyle = 'rgba(42,32,27,0.6)'; ctx.fill();
      ctx.fillStyle = C.cream; ctx.fillText(versi, W - tw - 80, 101); ctx.restore();
    }
    watermark(ctx);
  } };
}

function klipStruk(latar, kertas, cta) {
  const lebar = 860;
  const skala = Math.min(lebar / kertas.width, (H - 380 - 300) / kertas.h);
  const pw = kertas.width * skala, ph = kertas.h * skala, px = (W - pw) / 2;
  // printer + kertas di tengah layar, sisakan ruang ajakan di bawah
  const slotY = Math.max(220, Math.round((H - 300 - ph) / 2 - 20));
  const T_FEED = 2.8, dur = 5.6;
  return { dur, draw(ctx, t) {
    ctx.drawImage(latar, 0, 0, W, H);
    // kertas keluar bertahap seperti printer kasir (maju-berhenti kecil)
    const p = clamp(t / T_FEED, 0, 1), langkah = 26, f = p * langkah, k = Math.floor(f), sisa = f - k;
    const keluar = Math.min(1, (k + ease(clamp(sisa * 1.6, 0, 1))) / langkah) * ph;
    ctx.save(); ctx.beginPath(); ctx.rect(0, slotY + 18, W, H); ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.drawImage(kertas.canvas, 0, 0, kertas.width, kertas.h, px, slotY + 18 + keluar - ph, pw, ph);
    ctx.restore();
    // printer
    ctx.save(); kotakBulat(ctx, px - 70, slotY - 70, pw + 140, 96, 30); ctx.fillStyle = '#17110D'; ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(px - 16, slotY + 10, pw + 32, 10);
    ctx.fillStyle = C.glow; ctx.beginPath(); ctx.arc(px + pw + 30, slotY - 22, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 22px NgSans7'; ctx.fillStyle = 'rgba(247,241,232,0.6)'; ctx.fillText(BRAND.nama.toUpperCase().split('').join(' '), px - 30, slotY - 14); ctx.restore();
    const a = easeOut(clamp((t - T_FEED - 0.1) / 0.5, 0, 1));
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = '600 64px NgFraunces'; teksBayang(ctx, cta || 'barangnya ada di link bio', W / 2, H - 200 + (1 - a) * 20);
      ctx.font = '500 34px NgSans5'; teksBayang(ctx, `follow @${BRAND.handle}`, W / 2, H - 140 + (1 - a) * 20, 'rgba(247,241,232,0.85)', 8);
      ctx.restore();
    }
  } };
}

// ---------- rakit ----------
async function siapkanKertas(png) {
  const im = await loadImage(png);
  const c = createCanvas(im.width, im.height); const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const data = x.getImageData(0, 0, im.width, im.height).data;
  let h = im.height;
  for (let y = im.height - 1; y >= 0; y--) { let ada = false; for (let xx = 0; xx < im.width; xx += 8) if (data[(y * im.width + xx) * 4 + 3] > 10) { ada = true; break; } if (ada) { h = y + 1; break; } }
  return { canvas: c, width: im.width, h };
}
async function siapkanLatar(img) {
  const c = createCanvas(W, H); const x = c.getContext('2d');
  const s = Math.max(W / img.width, H / img.height) * 1.1;
  x.filter = 'blur(36px)';
  x.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  x.filter = 'none'; x.fillStyle = 'rgba(25,18,13,0.55)'; x.fillRect(0, 0, W, H);
  return c;
}

/*
  d = {
    pembuka: { kicker, judul, sub },
    units: [{ label, sudut: [{ img: Buffer, boxes: { pin: [y0,x0,y1,x1] }, titik: { pin: [y,x] } }] }],
    produk: [{ pin, nama, harga, jenis, unit }],
    insight: [{ judul, isi, pin }],
    kertas: Buffer PNG (struk transparan),
    cta
  }
*/
export async function buatReels(d) {
  daftarFont();
  const units = [];
  for (const u of d.units) {
    const sudut = [];
    for (const s of u.sudut) sudut.push({ img: await loadImage(s.img), boxes: s.boxes || {}, titik: s.titik || {} });
    units.push({ label: u.label, sudut });
  }
  const klip = [];
  const utama = units[0].sudut[0];
  klip.push(klipJudul(utama.img, utama.boxes, d.pembuka || {}));
  const pakaiIns = new Set();
  let giliran = 1;
  units.forEach((u, k) => {
    const pu = d.produk.filter((p) => (p.unit || 0) === k);
    if (units.length > 1) klip.push(klipVersi(u.sudut[0].img, u.sudut[0].boxes, u.label));
    let sebelum = -1;
    pu.forEach((p) => {
      // sudut bergiliran; hindari sudut yang sama dua kali berturut-turut
      const ada = u.sudut.map((s, i) => (s.boxes[p.pin] ? i : -1)).filter((i) => i >= 0);
      if (!ada.length) return;
      let pilih = ada[giliran % ada.length]; if (pilih === sebelum && ada.length > 1) pilih = ada[(giliran + 1) % ada.length];
      giliran++; sebelum = pilih;
      const s = u.sudut[pilih];
      const ins = (d.insight || []).find((i, ii) => Number(i.pin) === Number(p.pin) && !pakaiIns.has(ii));
      if (ins) pakaiIns.add(d.insight.indexOf(ins));
      klip.push(klipProduk(s.img, s.boxes, s.titik, p, ins, units.length > 1 ? u.label : ''));
    });
  });
  const kertas = await siapkanKertas(d.kertas);
  klip.push(klipStruk(await siapkanLatar(utama.img), kertas, d.cta));

  // jadwal dengan crossfade antar klip
  const mulai = []; let tt = 0;
  klip.forEach((c, i) => { mulai.push(tt); tt += c.dur - (i < klip.length - 1 ? XF : 0); });
  const total = tt, nFrame = Math.round(total * FPS);
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  const cv2 = createCanvas(W, H), ctx2 = cv2.getContext('2d');

  const dir = path.join('/tmp', 'reels-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, 'reels.mp4');
  try {
    const ff = spawn(ffmpegPath, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; ff.stderr.on('data', (x) => { err = (err + x).slice(-3000); });
    const selesai = new Promise((ok, gagal) => ff.on('close', (c) => (c === 0 ? ok() : gagal(new Error('ffmpeg: ' + err.slice(-1500))))));
    const tulis = (buf) => new Promise((ok) => { if (ff.stdin.write(buf)) ok(); else ff.stdin.once('drain', ok); });
    let i = 0;
    for (let f = 0; f < nFrame; f++) {
      const T = f / FPS;
      while (i < klip.length - 1 && T >= mulai[i + 1] + XF) i++;
      ctx.globalAlpha = 1; ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
      klip[i].draw(ctx, T - mulai[i]);
      if (i < klip.length - 1 && T >= mulai[i + 1]) {
        ctx2.globalAlpha = 1; ctx2.fillStyle = C.ink; ctx2.fillRect(0, 0, W, H);
        klip[i + 1].draw(ctx2, T - mulai[i + 1]);
        ctx.save(); ctx.globalAlpha = ease(clamp((T - mulai[i + 1]) / XF, 0, 1)); ctx.drawImage(cv2, 0, 0); ctx.restore();
      }
      await tulis(cv.data());
    }
    ff.stdin.end();
    await selesai;
    return { mp4: await readFile(out), detik: total };
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
