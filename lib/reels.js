// Reels/Shorts 9:16 gaya "detailing" sinematik: beberapa foto (utama + sudut/detail), tiap adegan bergerak pelan
// (zoom/geser), teks layar kecil seperlunya, aturan meja diketik huruf demi huruf di adegan produk terkait,
// penutup struk keluar dari printer kasir. Tanpa nama/harga produk di layar (penasaran -> cek profil).
// Digambar frame demi frame di canvas (mulus, tanpa getar), di-encode ffmpeg. Satu file cocok untuk IG Reels, YT Shorts, FB Reels.
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fraunces600, dmsans500, dmsans700 } from './fonts.js';
import { BRAND } from './brand.js';

const W = 1080, H = 1920, FPS = 30, XF = 0.45;
const C = { ink: '#2A201B', cream: '#F7F1E8', glow: '#E3A06F', paper: '#FBF7F1' };
// zona aman lintas platform: hindari 22% bawah (caption/tombol) dan 14% kanan (ikon like/share)
const AMAN = { kiri: 72, kanan: W - 150, bawah: H * 0.76 };

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
const halus = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- kamera ----------
const sCover = (img) => Math.max(W / img.width, H / img.height);
function rapikan(img, v) {
  const s = Math.max(v.s, sCover(img));
  const hw = W / 2 / s, hh = H / 2 / s;
  return { s, cx: clamp(v.cx, hw, img.width - hw), cy: clamp(v.cy, hh, img.height - hh) };
}
function gambarFoto(ctx, img, v) {
  const r = rapikan(img, v);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, W / 2 - r.cx * r.s, H / 2 - r.cy * r.s, img.width * r.s, img.height * r.s);
}
// gerak kamera pelan (Ken Burns): titik fokus (fx, fy dalam piksel foto) jadi pusat gerak
function gerakan(img, jenis, fx, fy) {
  const s0 = sCover(img), sZ = s0 * 1.14;
  const dx = (W / sZ) * 0.07, dy = (H / sZ) * 0.06;
  const pusat = { cx: fx, cy: fy };
  switch (jenis) {
    case 'zoom_out': return [{ ...pusat, s: sZ }, { ...pusat, s: s0 * 1.02 }];
    case 'geser_kiri': return [{ cx: fx + dx, cy: fy, s: sZ }, { cx: fx - dx, cy: fy, s: sZ }];
    case 'geser_kanan': return [{ cx: fx - dx, cy: fy, s: sZ }, { cx: fx + dx, cy: fy, s: sZ }];
    case 'naik': return [{ cx: fx, cy: fy + dy, s: sZ }, { cx: fx, cy: fy - dy, s: sZ }];
    case 'turun': return [{ cx: fx, cy: fy - dy, s: sZ }, { cx: fx, cy: fy + dy, s: sZ }];
    default: return [{ ...pusat, s: s0 * 1.02 }, { ...pusat, s: sZ }]; // zoom_in
  }
}

// ---------- teks & efek ----------
function bungkus(ctx, teks, maxW) {
  const kata = String(teks || '').split(/\s+/).filter(Boolean); const baris = []; let cur = '';
  for (const k of kata) { const coba = cur ? cur + ' ' + k : k; if (ctx.measureText(coba).width > maxW && cur) { baris.push(cur); cur = k; } else cur = coba; }
  if (cur) baris.push(cur);
  return baris;
}
function teksBayang(ctx, teks, x, y, warna = C.cream, blur = 22) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = blur; ctx.shadowOffsetY = 2; ctx.fillStyle = warna; ctx.fillText(teks, x, y); ctx.restore();
}
function kotakBulat(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
let vignet = null;
function gambarVignet(ctx) {
  if (!vignet) {
    vignet = createCanvas(W, H); const v = vignet.getContext('2d');
    const g = v.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,6,4,0.42)');
    v.fillStyle = g; v.fillRect(0, 0, W, H);
  }
  ctx.drawImage(vignet, 0, 0);
}
// teks layar kecil di tengah (gaya "the art of..."), muncul & hilang lembut
function teksLayar(ctx, teks, t, dur, besar = 54) {
  if (!teks) return;
  const a = Math.min(easeOut(clamp((t - 0.25) / 0.6, 0, 1)), 1 - halus(clamp((t - (dur - 0.7)) / 0.5, 0, 1)));
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = `600 ${besar}px NgFraunces`;
  const baris = bungkus(ctx, teks, AMAN.kanan - AMAN.kiri - 40).slice(0, 2);
  const y0 = H * 0.44 - (baris.length - 1) * besar * 0.6 + (1 - a) * 12;
  baris.forEach((b, i) => teksBayang(ctx, b, W / 2, y0 + i * besar * 1.15));
  ctx.restore();
}
function watermark(ctx) {
  ctx.save(); ctx.globalAlpha = 0.65; ctx.font = '500 26px NgSans5'; ctx.textAlign = 'left';
  teksBayang(ctx, BRAND.handle, AMAN.kiri, 118, C.cream, 10); ctx.restore();
}

// ---------- klip ----------
function klipAdegan(img, a, ins, hook) {
  const fx = a.fokus ? a.fokus.x : img.width / 2, fy = a.fokus ? a.fokus.y : img.height / 2;
  const [v0, v1] = gerakan(img, a.gerak, fx, fy);
  const isi = ins ? String(ins.isi || '') : '';
  const dur = ins ? Math.max(3.4, 1.0 + isi.length / 26 + 1.4) : hook ? 3.0 : 2.5;
  return { dur, draw(ctx, t) {
    const p = halus(clamp(t / dur, 0, 1));
    gambarFoto(ctx, img, { cx: lerp(v0.cx, v1.cx, p), cy: lerp(v0.cy, v1.cy, p), s: lerp(v0.s, v1.s, p) });
    gambarVignet(ctx);
    if (hook) teksLayar(ctx, hook, t, dur, 62);
    else if (!ins) teksLayar(ctx, a.teks, t, dur);
    if (ins) {
      const aI = easeOut(clamp((t - 0.45) / 0.45, 0, 1));
      if (aI > 0) {
        const x = AMAN.kiri, w = AMAN.kanan - AMAN.kiri;
        ctx.font = '500 36px NgSans5';
        const baris = bungkus(ctx, isi, w - 80);
        const tinggi = 164 + baris.length * 50, y = H * 0.5 - tinggi / 2 + (1 - aI) * 18;
        ctx.save(); ctx.globalAlpha = aI;
        ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
        kotakBulat(ctx, x, y, w, tinggi, 26); ctx.fillStyle = 'rgba(251,247,241,0.93)'; ctx.fill(); ctx.restore();
        ctx.save(); ctx.globalAlpha = aI;
        ctx.fillStyle = '#B0632D'; ctx.font = '700 24px NgSans7'; ctx.fillText('A T U R A N   M E J A', x + 40, y + 58);
        ctx.fillStyle = C.ink; ctx.font = '600 46px NgFraunces'; ctx.fillText(String(ins.judul || '').slice(0, 30), x + 40, y + 116);
        const n = Math.floor(clamp((t - 1.0) * 26, 0, isi.length));
        let sisa = n, lx = x + 40, ly = y + 176;
        ctx.font = '500 36px NgSans5'; ctx.fillStyle = '#4A3B31';
        baris.forEach((b, i) => {
          if (sisa <= 0) return;
          const potong = b.slice(0, sisa); sisa -= b.length + 1;
          ctx.fillText(potong, x + 40, y + 176 + i * 50); lx = x + 40 + ctx.measureText(potong).width; ly = y + 176 + i * 50;
        });
        if (n < isi.length || Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = '#B0632D'; ctx.fillRect(lx + 4, ly - 32, 4, 40); }
        ctx.restore();
      }
    }
    watermark(ctx);
  } };
}

function klipStruk(latar, kertas, teks) {
  const lebar = 860;
  const skala = Math.min(lebar / kertas.width, (H * 0.76 - 420) / kertas.h);
  const pw = kertas.width * skala, ph = kertas.h * skala, px = (W - pw) / 2 - 20;
  const slotY = Math.max(260, Math.round((H * 0.76 - 120 - ph) / 2));
  const T_FEED = 2.8, dur = 5.4;
  return { dur, draw(ctx, t) {
    ctx.drawImage(latar, 0, 0, W, H);
    const p = clamp(t / T_FEED, 0, 1), langkah = 26, f = p * langkah, k = Math.floor(f), sisa = f - k;
    const keluar = Math.min(1, (k + ease(clamp(sisa * 1.6, 0, 1))) / langkah) * ph;
    ctx.save(); ctx.beginPath(); ctx.rect(0, slotY + 18, W, H); ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.drawImage(kertas.canvas, 0, 0, kertas.width, kertas.h, px, slotY + 18 + keluar - ph, pw, ph);
    ctx.restore();
    ctx.save(); kotakBulat(ctx, px - 60, slotY - 70, pw + 120, 96, 30); ctx.fillStyle = '#17110D'; ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(px - 16, slotY + 10, pw + 32, 10);
    ctx.fillStyle = C.glow; ctx.beginPath(); ctx.arc(px + pw + 26, slotY - 22, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 22px NgSans7'; ctx.fillStyle = 'rgba(247,241,232,0.6)'; ctx.fillText(BRAND.nama.toUpperCase().split('').join(' '), px - 20, slotY - 14); ctx.restore();
    const a = easeOut(clamp((t - T_FEED - 0.1) / 0.5, 0, 1));
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
      const yT = Math.min(H * 0.76 - 40, slotY + 18 + ph + 110);
      ctx.font = '600 58px NgFraunces'; teksBayang(ctx, teks || 'spill-nya di profil', W / 2 - 20, yT + (1 - a) * 20);
      ctx.font = '500 32px NgSans5'; teksBayang(ctx, `@${BRAND.handle}`, W / 2 - 20, yT + 56 + (1 - a) * 20, 'rgba(247,241,232,0.85)', 8);
      ctx.restore();
    }
  } };
}

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
  x.filter = 'blur(36px)'; x.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  x.filter = 'none'; x.fillStyle = 'rgba(25,18,13,0.55)'; x.fillRect(0, 0, W, H);
  return c;
}

/*
  d = {
    foto: { kunci: Buffer },                       // "utama", "utama2", "1".."4"
    fokus: { kunci: { pin: [y, x] 0-1000 } },     // opsional: titik produk di foto (untuk zoom ke produk)
    naskah: { hook_layar, adegan: [{ foto, gerak, teks, aturan, pin }], teks_penutup },
    insight: [{ judul, isi }],
    kertas: Buffer PNG struk transparan
  }
*/
export async function buatReels(d) {
  daftarFont();
  const img = {};
  for (const [k, b] of Object.entries(d.foto)) if (b) img[k] = await loadImage(b);
  const kunciAda = Object.keys(img);
  const ambilImg = (k) => img[String(k)] || img.utama || img[kunciAda[0]];
  const n = d.naskah || {};
  let adegan = (Array.isArray(n.adegan) ? n.adegan : []).filter(Boolean).slice(0, 9);
  if (!adegan.length) adegan = kunciAda.map((k, i) => ({ foto: k, gerak: ['zoom_in', 'geser_kiri', 'zoom_out', 'geser_kanan'][i % 4], teks: '', aturan: null }));
  // pastikan tiap aturan meja muncul tepat sekali
  const sudah = new Set();
  adegan = adegan.map((a) => { const r = Number(a.aturan); if (r >= 1 && r <= 3 && !sudah.has(r) && d.insight && d.insight[r - 1]) { sudah.add(r); return { ...a, aturan: r }; } return { ...a, aturan: null }; });

  const klip = adegan.map((a, i) => {
    const im = ambilImg(a.foto);
    const t = a.pin && d.fokus && d.fokus[String(a.foto)] && d.fokus[String(a.foto)][a.pin];
    const fokus = t ? { x: t[1] / 1000 * im.width, y: t[0] / 1000 * im.height } : null;
    return klipAdegan(im, { ...a, fokus }, a.aturan ? d.insight[a.aturan - 1] : null, i === 0 ? (n.hook_layar || '') : '');
  });
  klip.push(klipStruk(await siapkanLatar(ambilImg('utama')), await siapkanKertas(d.kertas), n.teks_penutup));

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
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
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
        ctx.save(); ctx.globalAlpha = halus(clamp((T - mulai[i + 1]) / XF, 0, 1)); ctx.drawImage(cv2, 0, 0); ctx.restore();
      }
      await tulis(cv.data());
    }
    ff.stdin.end();
    await selesai;
    return { mp4: await readFile(out), detik: total };
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
