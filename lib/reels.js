// Video Reels/Shorts/FB 9:16, ±12-16 detik, TANPA teks: potongan keras tepat di ketukan musik (bebas royalti, ikut tertanam).
// Alur: meja berantakan -> FLASH -> setup jadi (sudut sama) -> detail cepat tiap ketukan (zoom punch di awal birama)
// -> [post dua versi: FLASH -> versi kedua -> detail] -> setup lebar -> FLASH -> meja berantakan lagi (loop mulus ke awal).
// Digambar frame demi frame di canvas, encode ffmpeg + audio.
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const W = 1080, H = 1920, FPS = 30;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
function gambar(ctx, img, v) {
  const r = rapikan(img, v);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, W / 2 - r.cx * r.s, H / 2 - r.cy * r.s, img.width * r.s, img.height * r.s);
}
// view lebar: pusat = rata-rata titik produk (foto 4:5 dipotong 9:16 tanpa memotong produk)
function viewLebar(img, titik) {
  const t = Object.values(titik || {});
  const cx = t.length ? t.reduce((s, p) => s + p[1], 0) / t.length / 1000 * img.width : img.width / 2;
  return rapikan(img, { cx, cy: img.height / 2, s: sCover(img) });
}
const viewFokus = (img, p, kali = 1.85) => rapikan(img, { cx: p[1] / 1000 * img.width, cy: p[0] / 1000 * img.height, s: sCover(img) * kali });

// ---------- potongan ----------
// tiap potongan: {img, v0, v1, punch, flash, gelap}; digambar selama `n` ketukan
function gambarPotongan(ctx, p, t, dur) {
  const k = halus(clamp(t / dur, 0, 1));
  let v = { cx: lerp(p.v0.cx, p.v1.cx, k), cy: lerp(p.v0.cy, p.v1.cy, k), s: lerp(p.v0.s, p.v1.s, k) };
  if (p.punch) v = { ...v, s: v.s * (1 + 0.1 * (1 - easeOut(clamp(t / 0.22, 0, 1)))) };
  gambar(ctx, p.img, v);
  if (p.gelap) { ctx.fillStyle = `rgba(20,16,14,${p.gelap})`; ctx.fillRect(0, 0, W, H); }
  if (p.flash) { const a = 1 - easeOut(clamp(t / 0.2, 0, 1)); if (a > 0.01) { ctx.fillStyle = `rgba(255,252,246,${a})`; ctx.fillRect(0, 0, W, H); } }
}

/*
  d = {
    foto: { before, utama, utama2?, '1'..'4' } (Buffer),
    titik: { utama: {pin:[y,x]}, utama2: {...} },
    unitFoto: [['1','2'], ['3','4']]   // foto tambahan milik tiap versi (urut)
    lagu: { buf (m4a), bpm, mulai }
  }
*/
export async function buatReels(d) {
  const img = {};
  for (const [k, b] of Object.entries(d.foto)) if (b) img[k] = await loadImage(b);
  const nUnit = img.utama2 ? 2 : 1;
  const ketuk = 60 / d.lagu.bpm;
  const pot = ketuk < 0.45 ? ketuk * 2 : ketuk > 1.0 ? ketuk / 2 : ketuk; // panjang satu potongan ≈ 0.45-1.0 dtk

  const daftar = []; // {img, v0, v1, n, punch, flash, gelap}
  const tambah = (x) => daftar.push({ n: 1, ...x });
  const utamaKey = (u) => (u ? 'utama2' : 'utama');
  const wideUtama = viewLebar(img.utama, d.titik.utama);
  const before = img.before || img.utama;
  const vBefore = img.before ? rapikan(before, { cx: wideUtama.cx / img.utama.width * before.width, cy: wideUtama.cy / img.utama.height * before.height, s: wideUtama.s * img.utama.width / before.width }) : wideUtama;
  // 1) meja berantakan (dorong pelan)
  tambah({ img: before, v0: vBefore, v1: { ...vBefore, s: vBefore.s * 1.05 }, n: 2, gelap: img.before ? 0 : 0.35 });
  for (let u = 0; u < nUnit; u++) {
    const ik = utamaKey(u), im = img[ik], tt = d.titik[ik] || {};
    const w = u === 0 ? wideUtama : viewLebar(im, tt);
    // 2) FLASH -> setup jadi, sudut sama, punch keluar
    tambah({ img: im, v0: { ...w, s: w.s * 1.06 }, v1: w, n: 2, flash: true, punch: true });
    // 3) detail tiap ketukan: foto tambahan versi ini + close-up produk dari foto utama, bergantian
    const tambahan = (d.unitFoto[u] || []).filter((k) => img[k]);
    const fokus = Object.values(tt);
    const nDetail = nUnit > 1 ? 6 : 10;
    for (let i = 0; i < nDetail; i++) {
      const pakaiTambahan = tambahan.length && (i % 2 === 0 || !fokus.length);
      let x;
      if (pakaiTambahan) {
        const f = img[tambahan[Math.floor(i / 2) % tambahan.length]]; const c = rapikan(f, { cx: f.width / 2, cy: f.height / 2, s: sCover(f) });
        const gerak = [[1, 1.07, 0, 0], [1.08, 1.0, 0, 0], [1.08, 1.08, 0.05, -0.05], [1.08, 1.08, -0.05, 0.05]][i % 4];
        x = { img: f, v0: { cx: c.cx + gerak[2] * f.width, cy: c.cy, s: c.s * gerak[0] }, v1: { cx: c.cx + gerak[3] * f.width, cy: c.cy, s: c.s * gerak[1] } };
      } else {
        const p = fokus[i % Math.max(1, fokus.length)] || [500, 500];
        const v = viewFokus(im, p, 1.7 + 0.15 * (i % 3));
        x = { img: im, v0: v, v1: { ...v, s: v.s * 1.06 } };
      }
      tambah({ ...x, punch: (daftar.length % 4) === 0 });
    }
  }
  // 4) setup lebar (versi terakhir) mundur pelan -> FLASH -> berantakan lagi = frame pertama (loop)
  const ik = utamaKey(nUnit - 1), wl = nUnit > 1 ? viewLebar(img[ik], d.titik[ik]) : wideUtama;
  tambah({ img: img[ik], v0: { ...wl, s: wl.s * 1.08 }, v1: wl, n: 2 });
  tambah({ img: before, v0: { ...vBefore, s: vBefore.s * 1.03 }, v1: vBefore, n: 1, flash: true, gelap: img.before ? 0 : 0.35 });

  const jadwal = []; let tt = 0;
  for (const p of daftar) { const dur = p.n * pot; jadwal.push({ p, mulai: tt, dur }); tt += dur; }
  const total = tt, nFrame = Math.round(total * FPS);

  const dir = path.join('/tmp', 'reels-' + Date.now().toString(36));
  await mkdir(dir, { recursive: true });
  const audio = path.join(dir, 'lagu.m4a'), out = path.join(dir, 'video.mp4');
  await writeFile(audio, d.lagu.buf);
  try {
    const ff = spawn(ffmpegPath, ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
      '-ss', String(d.lagu.mulai || 0), '-t', total.toFixed(3), '-i', audio,
      '-map', '0:v', '-map', '1:a', '-af', `afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, total - 0.25).toFixed(3)}:d=0.25`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; ff.stderr.on('data', (x) => { err = (err + x).slice(-3000); });
    const selesai = new Promise((ok, gagal) => ff.on('close', (c) => (c === 0 ? ok() : gagal(new Error('ffmpeg: ' + err.slice(-1500))))));
    const tulis = (buf) => new Promise((ok) => { if (ff.stdin.write(buf)) ok(); else ff.stdin.once('drain', ok); });
    const cv = createCanvas(W, H), ctx = cv.getContext('2d');
    let i = 0;
    for (let f = 0; f < nFrame; f++) {
      const T = f / FPS;
      while (i < jadwal.length - 1 && T >= jadwal[i + 1].mulai) i++;
      const j = jadwal[i];
      ctx.fillStyle = '#1C1612'; ctx.fillRect(0, 0, W, H);
      gambarPotongan(ctx, j.p, T - j.mulai, j.dur);
      // kilat kecil 2 frame sebelum flash berikutnya (antisipasi)
      const nx = jadwal[i + 1];
      if (nx && nx.p.flash && nx.mulai - T < 2.5 / FPS) { ctx.fillStyle = 'rgba(255,250,240,0.35)'; ctx.fillRect(0, 0, W, H); }
      await tulis(cv.data());
    }
    ff.stdin.end();
    await selesai;
    return { mp4: await readFile(out), detik: total, potongan: daftar.length };
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
